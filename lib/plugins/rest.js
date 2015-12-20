'use strict';

var _ = require('underscore');

var util = require('util');
var Plugin = require('../plugin');

function Rest(player, callback) {
    Plugin.apply(this);

    // NOTE: no argument passed so we get the core's config
    var config = require('../config').getConfig();
    var self = this;

    if (!player.app) {
        return callback('module must be initialized after express module!');
    }

    player.app.use(function(req, res, next) {
        res.sendRes = function(err, data) {
            if (err) {
                res.status(404).send(err);
            } else {
                res.send(data || 'ok');
            }
        };
        next();
    });

    player.app.get('/queue', function(req, res) {
        var np = player.nowPlaying;
        var pos = 0;
        if (np) {
            if (np.playback.startTime) {
                pos = new Date().getTime() - np.playback.startTime + np.playback.startPos;
            } else {
                pos = np.playback.startPos;
            }
        }

        res.json({
            songs: player.queue.serialize(),
            nowPlaying: np ? np.serialize() : null,
            nowPlayingPos: pos,
            play: player.play
        });
    });

    // TODO: error handling
    player.app.post('/queue/song', function(req, res) {
        var err = player.queue.insertSongs(null, req.body);

        res.sendRes(err);
    });
    player.app.post('/queue/song/:at', function(req, res) {
        var err = player.queue.insertSongs(req.params.at, req.body);

        res.sendRes(err);
    });

    /*
    player.app.post('/queue/move/:pos', function(req, res) {
        var err = player.moveInQueue(
            parseInt(req.params.pos),
            parseInt(req.body.to),
            parseInt(req.body.cnt)
        );
        sendResponse(res, 'success', err);
    });
    */

    player.app.delete('/queue/song/:at', function(req, res) {
        player.removeSongs(req.params.at, parseInt(req.query.cnt) || 1, res.sendRes);
    });

    player.app.post('/playctl/play', function(req, res) {
        player.startPlayback(parseInt(req.body.position) || 0);
        res.sendRes(null, 'ok');
    });

    player.app.post('/playctl/stop', function(req, res) {
        player.stopPlayback(req.query.pause);
        res.sendRes(null, 'ok');
    });

    player.app.post('/playctl/skip', function(req, res) {
        player.skipSongs(parseInt(req.body.cnt));
        res.sendRes(null, 'ok');
    });

    player.app.post('/playctl/shuffle', function(req, res) {
        player.shuffleQueue();
        res.sendRes(null, 'ok');
    });

    player.app.post('/volume', function(req, res) {
        player.setVolume(parseInt(req.body));
        res.send('success');
    });

    // search for songs, search terms in query params
    player.app.get('/search', function(req, res) {
        self.log.verbose('got search request: ' + JSON.stringify(req.query));

        player.searchBackends(req.query, function(results) {
            res.json(results);
        });
    });

    this.pendingRequests = {};
    var rest = this;
    this.registerHook('onPrepareProgress', function(song, chunk, done) {
        if (!rest.pendingRequests[song.backendName]) {
            return;
        }

        _.each(rest.pendingRequests[song.backendName][song.songId], function(res) {
            if (chunk) {
                res.write(chunk);
            }
            if (done) {
                res.end();
                rest.pendingRequests[song.backendName][song.songId] = [];
            }
        });
    });

    this.registerHook('onBackendInitialized', function(backendName) {
        rest.pendingRequests[backendName] = {};

        // provide API path for music data, might block while song is preparing
        player.app.get('/song/' + backendName + '/:fileName', function(req, res, next) {
            var extIndex = req.params.fileName.lastIndexOf('.');
            var songId = req.params.fileName.substring(0, extIndex);
            var songFormat = req.params.fileName.substring(extIndex + 1);

            var song = {
                songId: songId,
                format: songFormat
            };

            if (player.backends[backendName].isPrepared(song)) {
                // song should be available on disk
                res.sendFile('/' + backendName + '/' + songId + '.' + songFormat, {
                    root: config.songCachePath
                });
            } else if (player.songsPreparing[backendName] &&
                    player.songsPreparing[backendName][songId]) {
                // song is preparing
                var preparingSong = player.songsPreparing[backendName][songId];

                // try finding out length of song
                var queuedSong = player.searchQueue(backendName, songId);
                if (queuedSong) {
                    res.setHeader('X-Content-Duration', queuedSong.duration / 1000);
                }

                res.setHeader('Transfer-Encoding', 'chunked');
                res.setHeader('Content-Type', 'audio/ogg; codecs=opus');
                res.setHeader('Accept-Ranges', 'bytes');

                var range = [0];
                if (req.headers.range) {
                    // partial request

                    range = req.headers.range.substr(req.headers.range.indexOf('=') + 1).split('-');
                    res.statusCode = 206;

                    // a best guess for the header
                    var end;
                    var dataLen = preparingSong.songData ? preparingSong.songData.length : 0;
                    if (range[1]) {
                        end = Math.min(range[1], dataLen - 1);
                    } else {
                        end = dataLen - 1;
                    }

                    // TODO: we might be lying here if the code below sends whole song
                    res.setHeader('Content-Range', 'bytes ' + range[0] + '-' + end + '/*');
                }

                // TODO: we can be smarter here: currently most corner cases
                // lead to sending entire song even if only part of it was
                // requested. Also the range end is currently ignored

                // skip to start of requested range if we have enough data,
                // otherwise serve whole song
                if (range[0] < preparingSong.songData.length) {
                    res.write(preparingSong.songData.slice(range[0]));
                } else {
                    res.write(preparingSong.songData);
                }

                rest.pendingRequests[backendName][song.songId] =
                    rest.pendingRequests[backendName][song.songId] || [];

                rest.pendingRequests[backendName][song.songIsongId].push(res);
            } else {
                res.status(404).end('404 song not found');
            }
        });
    });

    callback(null, this);
}

util.inherits(Rest, Plugin);

module.exports = Rest;
