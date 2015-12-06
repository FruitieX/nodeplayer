'use strict';

var MODULE_NAME = 'file';
var MODULE_TYPE = 'backend';

var walk = require('walk');
var probe = require('node-ffprobe');
var path = require('path');
var mkdirp = require('mkdirp');
var url = require('url');
var fs = require('fs');
var async = require('async');
var ffmpeg = require('fluent-ffmpeg');
var watch = require('node-watch');
var _ = require('underscore');
var escapeStringRegexp = require('escape-string-regexp');

var nodeplayerConfig = require('nodeplayer').config;
var coreConfig = nodeplayerConfig.getConfig();
var defaultConfig = require('./default-config.js');
var config = nodeplayerConfig.getConfig(MODULE_TYPE + '-' + MODULE_NAME, defaultConfig);

var fileBackend = {};
fileBackend.name = MODULE_NAME;

var logger = require('nodeplayer').logger(MODULE_NAME);
var walker;
var db;
var medialibraryPath;

// TODO: seeking
var encodeSong = function(origStream, seek, song, progCallback, errCallback) {
};

// cache songID to disk.
// on success: progCallback must be called with true as argument
// on failure: errCallback must be called with error message
// returns a function that cancels preparing
fileBackend.prepareSong = function(song, progCallback, errCallback) {
    var filePath = coreConfig.songCachePath + '/file/' + song.songID + '.opus';

    if (fs.existsSync(filePath)) {
        progCallback(song, null, true);
    } else {
        var cancelEncode = null;
        var canceled = false;
        var cancelPreparing = function() {
            canceled = true;
            if (cancelEncode) {
                cancelEncode();
            }
        };

        db.collection('songs').findById(song.songID, function(err, item) {
            if (canceled) {
                errCallback(song, 'song was canceled before encoding started');
            } else if (item) {
                var readStream = fs.createReadStream(item.file);
                cancelEncode = encodeSong(readStream, 0, song, progCallback, errCallback);
                readStream.on('error', function(err) {
                    errCallback(song, err);
                });
            } else {
                errCallback(song, 'song not found in local db');
            }
        });

        return cancelEncode;
    }
};

fileBackend.isPrepared = function(song) {
    var filePath = coreConfig.songCachePath + '/file/' + song.songID + '.opus';
    return fs.existsSync(filePath);
};

fileBackend.search = function(query, callback, errCallback) {
    var q;
    if (query.any) {
        q = {
            $or: [
                {artist: new RegExp(escapeStringRegexp(query.any), 'i')},
                {title: new RegExp(escapeStringRegexp(query.any), 'i')},
                {album: new RegExp(escapeStringRegexp(query.any), 'i')}
            ]
        };
    } else {
        q = {
            $and: []
        };

        _.keys(query).forEach(function(key) {
            var criterion = {};
            criterion[key] = new RegExp(escapeStringRegexp(query[key]), 'i');
            q.$and.push(criterion);
        });
    }

    logger.verbose('Got query: ');
    logger.verbose(q);

    db.collection('songs').find(q).toArray(function(err, items) {
        // Also filter away special chars? (Remix) ?= Remix åäö日本穂?
        /*
        var termsArr = query.terms.split(' ');
        termsArr.forEach(function(e, i, arr) {arr[i] = e.toLowerCase();});
        for (var i in items) {
            items[i].score = 0;
            var words = [];
            if (items[i].title) {
                words = words.concat(items[i].title.split(' '));
            }
            if (items[i].artist) {
                words = words.concat(items[i].artist.split(' '));
            }
            if (items[i].album) {
                words = words.concat(items[i].album.split(' '));
            }
            words.forEach(function(e, i, arr) {arr[i] = e.toLowerCase();});
            for (var ii in words) {
                if (termsArr.indexOf(words[ii]) >= 0) {
                    items[i].score++;
                }
            }
        }
        items.sort(function(a, b) {
            return b.score - a.score; // sort by score
        });
        */
        var results = {};
        results.songs = {};

        var numItems = items.length;
        var cur = 0;
        for (var song in items) {
            results.songs[items[song]._id.toString()] = {
                artist: items[song].artist,
                title: items[song].title,
                album: items[song].album,
                albumArt: null, // TODO: can we add this?
                duration: items[song].duration,
                songID: items[song]._id.toString(),
                score: config.maxScore * (numItems - cur) / numItems,
                backendName: MODULE_NAME,
                format: 'opus'
            };
            cur++;
            if (Object.keys(results.songs).length > coreConfig.searchResultCnt) { break; }
        }
        callback(results);
    });
};
var probeCallback = function(err, probeData, next) {
    var formats = config.importFormats;
    if (probeData) {
        // ignore camel case rule here as we can't do anything about probeData
        //jscs:disable requireCamelCaseOrUpperCaseIdentifiers
        if (formats.indexOf(probeData.format.format_name) >= 0) { // Format is supported
            //jscs:enable requireCamelCaseOrUpperCaseIdentifiers
            var song = {
                title: '',
                artist: '',
                album: '',
                duration: '0',
            };

            // some tags may be in mixed/all caps, let's convert every tag to lower case
            var key;
            var keys = Object.keys(probeData.metadata);
            var n = keys.length;
            var metadata = {};
            while (n--) {
                key = keys[n];
                metadata[key.toLowerCase()] = probeData.metadata[key];
            }

            // try a best guess based on filename in case tags are unavailable
            var basename = path.basename(probeData.file);
            basename = path.basename(probeData.file, path.extname(basename));
            var splitTitle = basename.split(/\s-\s(.+)?/);

            if (!_.isUndefined(metadata.title)) {
                song.title = metadata.title;
            } else {
                song.title = splitTitle[1];
            }
            if (!_.isUndefined(metadata.artist)) {
                song.artist = metadata.artist;
            } else {
                song.artist = splitTitle[0];
            }
            if (!_.isUndefined(metadata.album)) {
                song.album = metadata.album;
            }

            song.file = probeData.file;

            song.duration = probeData.format.duration * 1000;
            db.collection('songs').update({file: probeData.file}, {'$set':song}, {upsert: true},
                    function(err, result) {
                if (result == 1) {
                    logger.debug('Upserted: ' + probeData.file);
                } else {
                    logger.error('error while updating db: ' + err);
                }

                next();
            });
        } else {
            logger.verbose('format not supported, skipping...');
            next();
        }
    } else {
        logger.error('error while probing:' + err);
        next();
    }
};

fileBackend.init = function(callback) {
    mkdirp.sync(coreConfig.songCachePath + '/file/incomplete');

    //jscs:disable requireCamelCaseOrUpperCaseIdentifiers
    db = require('mongoskin').db(config.mongo, {native_parser:true, safe:true});
    //jscs:enable requireCamelCaseOrUpperCaseIdentifiers

    var importPath = config.importPath;

    // Adds text index to database for title, artist and album fields
    // TODO: better handling and error checking
    var cb = function(err, index) {
        if (err) {
            logger.error(err);
            logger.error('Forgot to setup mongodb?');
        } else if (index) {
            logger.silly('index: ' + index);
        }
    };
    db.collection('songs').ensureIndex({title: 'text', artist: 'text', album: 'text'}, cb);

    var options = {
        followLinks: config.followSymlinks
    };

    // create async.js queue to limit concurrent probes
    var q = async.queue(function(task, callback) {
        probe(task.filename, function(err, probeData) {
            probeCallback(err, probeData, function() {
                logger.silly('q.length(): ' + q.length(), 'q.running(): ' + q.running());
                callback();
            });
        });
    }, config.concurrentProbes);

    // walk the filesystem and scan files
    // TODO: also check through entire DB to see that all files still exist on the filesystem
    if (config.rescanAtStart) {
        logger.info('Scanning directory: ' + importPath);
        walker = walk.walk(importPath, options);
        var startTime = new Date();
        var scanned = 0;
        walker.on('file', function(root, fileStats, next) {
            var filename = path.join(root, fileStats.name);
            logger.verbose('Scanning: ' + filename);
            scanned++;
            q.push({
                filename: filename
            });
            next();
        });
        walker.on('end', function() {
            logger.verbose('Scanned files: ' + scanned);
            logger.verbose('Done in: ' + Math.round((new Date() - startTime) / 1000) + ' seconds');
        });
    }

    // set fs watcher on media directory
    // TODO: add a debounce so if the file keeps changing we don't probe it multiple times
    watch(importPath, {recursive: true, followSymlinks: config.followSymlinks}, function(filename) {
        if (fs.existsSync(filename)) {
            logger.debug(filename + ' modified or created, queued for probing');
            q.unshift({
                filename: filename
            });
        } else {
            logger.debug(filename + ' deleted');
            db.collection('songs').remove({file: filename}, function(err, items) {
                logger.debug(filename + ' deleted from db: ' + err + ', ' + items);
            });
        }
    });

    // callback right away, as we can scan for songs in the background
    callback();
};
module.exports = fileBackend;
