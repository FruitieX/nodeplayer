'use strict';

var path = require('path');
var fs = require('fs');
var mkdirp = require('mkdirp');
var mongoose = require('mongoose');
var async = require('async');
var walk = require('walk');
var ffprobe = require('node-ffprobe');
var _ = require('underscore');
var escapeStringRegexp = require('escape-string-regexp');

var util = require('util');
var Backend = require('../backend');

// external libraries use lower_case extensively here
//jscs:disable requireCamelCaseOrUpperCaseIdentifiers

/*
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
            Song.update({file: probeData.file}, {'$set':song}, {upsert: true},
                    function(err, result) {
                if (result == 1) {
                    self.log.debug('Upserted: ' + probeData.file);
                } else {
                    self.log.error('error while updating db: ' + err);
                }

                next();
            });
        } else {
            self.log.verbose('format not supported, skipping...');
            next();
        }
    } else {
        self.log.error('error while probing:' + err);
        next();
    }
};
*/

// database model
var Song = mongoose.model('Song', {
    title: String,
    artist: String,
    album: String,
    albumArt: {
        lq: String,
        hq: String
    },
    duration: {
        type: Number,
        required: true
    },
    format: {
        type: String,
        required: true
    },
    filename: {
        type: String,
        unique: true,
        required: true,
        dropDups: true
    }
});

function Local(callback) {
    Backend.apply(this);

    var self = this;

    // NOTE: no argument passed so we get the core's config
    var config = require('../config').getConfig();
    this.config = config;
    this.songCachePath = config.songCachePath;
    this.importFormats = config.importFormats;

    // make sure all necessary directories exist
    mkdirp.sync(path.join(this.songCachePath, 'file', 'incomplete'));

    // connect to the database
    mongoose.connect(config.mongo);

    var db = mongoose.connection;
    db.on('error', function(err) {
        return callback(err, self);
    });
    db.once('open', function() {
        return callback(null, self);
    });

    var options = {
        followLinks: config.followSymlinks
    };

    var insertSong = function(probeData, done) {
        var song = new Song({
            title: probeData.metadata.TITLE,
            artist: probeData.metadata.ARTIST,
            album: probeData.metadata.ALBUM,
            //albumArt: {} // TODO
            duration: probeData.format.duration * 1000,
            format: probeData.format.format_name,
            filename: probeData.file
        });

        song = song.toObject();

        delete song._id;

        Song.findOneAndUpdate({
            filename: probeData.file
        }, song, {upsert: true}, function(err) {
            if (err) {
                self.log.error('while inserting song: ' + probeData.file + ', ' + err);
            }
            done();
        });
    };

    // create async.js queue to limit concurrent probes
    var q = async.queue(function(task, done) {
        ffprobe(task.filename, function(err, probeData) {
            if (!probeData) {
                return done();
            }

            var validStreams = false;

            if (_.contains(self.importFormats, probeData.format.format_name)) {
                validStreams = true;
            }

            if (validStreams) {
                insertSong(probeData, done);
            } else {
                self.log.info('skipping file of unknown format: ' + task.filename);
                done();
            }
        });
    }, config.concurrentProbes);

    // walk the filesystem and scan files
    // TODO: also check through entire DB to see that all files still exist on the filesystem
    // TODO: filter by allowed filename extensions
    if (config.rescanAtStart) {
        self.log.info('Scanning directory: ' + config.importPath);
        var walker = walk.walk(config.importPath, options);
        var startTime = new Date();
        var scanned = 0;
        walker.on('file', function(root, fileStats, next) {
            var filename = path.join(root, fileStats.name);
            self.log.verbose('Scanning: ' + filename);
            scanned++;
            q.push({
                filename: filename
            });
            next();
        });
        walker.on('end', function() {
            self.log.verbose('Scanned files: ' + scanned);
            self.log.verbose('Done in: ' +
                    Math.round((new Date() - startTime) / 1000) + ' seconds');
        });
    }

    // TODO: fs watch
    // set fs watcher on media directory
    // TODO: add a debounce so if the file keeps changing we don't probe it multiple times
    /*
    watch(config.importPath, {
        recursive: true,
        followSymlinks: config.followSymlinks
    }, function(filename) {
        if (fs.existsSync(filename)) {
            self.log.debug(filename + ' modified or created, queued for probing');
            q.unshift({
                filename: filename
            });
        } else {
            self.log.debug(filename + ' deleted');
            db.collection('songs').remove({file: filename}, function(err, items) {
                self.log.debug(filename + ' deleted from db: ' + err + ', ' + items);
            });
        }
    });
    */
}

// must be called immediately after constructor
util.inherits(Local, Backend);

/**
 * Synchronously(!) returns whether the song is prepared or not
 * @param {Song} song - Song to check
 * @returns {Boolean} - true if song is prepared, false if not
 */
Local.prototype.isPrepared = function(song) {
    var filePath = path.join(this.songCachePath, 'file', song.songId + '.opus');
    return fs.existsSync(filePath);
};

/**
 * Prepare song for playback
 * @param {Song} song - Song to prepare
 * @param {Function} callback - Called when song is ready or if an error occurred
 */
Local.prototype.prepare = function(song, callback) {
    var self = this;

    var filePath = self.songCachePath + '/file/' + song.songId + '.opus';

    if (fs.existsSync(filePath)) {
        callback(null, null, true);
    } else {
        var cancelEncode = null;
        var canceled = false;
        var cancelPreparing = function() {
            canceled = true;
            if (cancelEncode) {
                cancelEncode();
            }
        };

        Song.findById(song.songId, function(err, item) {
            if (canceled) {
                callback(new Error('song was canceled before encoding started'));
            } else if (item) {
                var readStream = fs.createReadStream(item.filename);
                cancelEncode = self.encodeSong(readStream, 0, song, callback);
                readStream.on('error', function(err) {
                    callback(err);
                });
            } else {
                callback('song not found in local db: ' + song.songId);
            }
        });

        return cancelEncode;
    }
};

/**
 * Search for songs
 * @param {Object} query - Search terms
 * @param {String} [query.artist] - Artist
 * @param {String} [query.title] - Title
 * @param {String} [query.album] - Album
 * @param {Boolean} [query.any] - Match any of the above, otherwise all fields have to match
 * @param {Function} callback - Called when song is ready or if an error occurred
 */
Local.prototype.search = function(query, callback) {
    var self = this;

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

    Song.find(q).exec(function(err, items) {
        if (err) {
            return callback(err);
        }

        var results = {};
        results.songs = {};

        var numItems = items.length;
        var cur = 0;
        items.forEach(function(song) {
            if (Object.keys(results.songs).length <= self.config.searchResultCnt) {
                song = song.toObject();

                results.songs[song._id] = {
                    artist: song.artist,
                    title: song.title,
                    album: song.album,
                    albumArt: null, // TODO: can we add this?
                    duration: song.duration,
                    songId: song._id,
                    score: self.config.maxScore * (numItems - cur) / numItems,
                    backendName: 'local',
                    format: 'opus'
                };
                cur++;
            }
        });
        callback(results);
    });
};

module.exports = Local;
