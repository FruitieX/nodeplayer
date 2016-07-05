'use strict';

var _ = require('underscore');
var ts = require('tail-stream');

var util = require('util');
var path = require('path');
var fs = require('fs');
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
        self.log.verbose('got search request: ' + JSON.stringify(req.body.query));

        player.searchBackends(req.body.query, function(results) {
            res.json(results);
        });
    });

    this.pendingRequests = {};
    var rest = this;
    this.registerHook('onPrepareProgress', function(song, bytesWritten, done) {
        song = song.serialize();

        if (!rest.pendingRequests[song.backendName]) {
            return;
        }

        _.each(rest.pendingRequests[song.backendName][song.songId], function(client) {
            /*
            if (bytesWritten) {
                var end = bytesWritten - 1;
                if (client.wishRange[1]) {
                    end = Math.min(client.wishRange[1], bytesWritten - 1);
                }

                console.log('end: ' + end + '\tclient.serveRange[1]: ' + client.serveRange[1]);

                if (client.serveRange[1] < end) {
                    console.log('write');
                    client.songStream.write(fs.createReadStream(client.filename, {
                        start: client.serveRange[1],
                        end: end
                    }));

                    client.serveRange[1] = end;
                }
            }
            */

            if (!client.songStream && bytesWritten) {
                var filepath = done ? client.filepath : client.incompletePath;
                client.songStream = ts.createReadStream(filepath, {
                    useWatch: false,
                    beginAt: client.serveRange[0],
                    endAt: client.serveRange[1] // TODO
                });

                console.log('opened: ' + filepath);
                client.songStream.pipe(client.res);
            }

            if (client.songStream && done) {
                console.log('done');
                client.songStream.end();
            }
        });

        if (done) {
            rest.pendingRequests[song.backendName][song.songId] = [];
        }
    });

    this.registerHook('onBackendInitialized', function(backendName) {
        rest.pendingRequests[backendName] = {};

        // provide API path for music data, might block while song is preparing
        player.app.get('/song/' + backendName + '/:fileName', function(req, res, next) {
            var extIndex = req.params.fileName.lastIndexOf('.');
            var songId = req.params.fileName.substring(0, extIndex);
            var songFormat = req.params.fileName.substring(extIndex + 1);

            var backend = player.backends[backendName];
            var filename = path.join(backendName, songId + '.' + songFormat);
            var incomplete = path.join(backendName, 'incomplete', songId + '.' + songFormat);

            if (backend.isPrepared({songId: songId})) {
                // song should be available on disk
                res.sendFile(filename, {
                    root: config.songCachePath
                });
            } else if (backend.songsPreparing[songId]) {
                // song is preparing
                var preparingSong = backend.songsPreparing[songId];

                // try finding out length of song
                var queuedSong = _.find(player.queue.serialize(), function(song) {
                    return song.songId === songId && song.backendName === backendName;
                });

                if (queuedSong) {
                    res.setHeader('X-Content-Duration', queuedSong.duration / 1000);
                }

                res.setHeader('Transfer-Encoding', 'chunked');
                res.setHeader('Content-Type', 'audio/ogg; codecs=opus');
                res.setHeader('Accept-Ranges', 'bytes');

                var haveRange = [];
                var wishRange = [];
                var serveRange = [];

                haveRange[0] = 0;
                haveRange[1] = preparingSong.bytesWritten - 1;

                wishRange[0] = 0;
                wishRange[1] = null

                serveRange[0] = 0;

                if (req.headers.range) {
                    // partial request

                    wishRange = req.headers.range.substr(req.headers.range.indexOf('=') + 1).split('-');

                    serveRange[0] = wishRange[0];

                    // a best guess for the response header
                    serveRange[1] = haveRange[1];
                    if (wishRange[1]) {
                        serveRange[1] = Math.min(wishRange[1], haveRange[1]);
                    }

                    res.statusCode = 206;
                    res.setHeader('Content-Range', 'bytes ' + serveRange[0] + '-' + serveRange[1] + '/*');
                } else {
                    serveRange[1] = haveRange[1];
                }

                if (!rest.pendingRequests[backendName][songId]) {
                    rest.pendingRequests[backendName][songId] = [];
                }

                var client = {
                    res: res,
                    serveRange: serveRange,
                    wishRange: wishRange,
                    incompletePath: path.join(config.songCachePath, incomplete),
                    filepath: path.join(config.songCachePath, filename)
                };

                // TODO: memory leak
                rest.pendingRequests[backendName][songId].push(client);

                // TODO: If we know that we have already flushed data to disk,
                // we could open up the read stream already here instead of waiting
                // around for the first flush

                // If we can satisfy the start of the requested range, write as
                // much as possible to res immediately
                /*
                if (haveRange[1] >= wishRange[0]) {
                    client.songStream.write(fs.createReadStream(client.filename, {
                        start: serveRange[0],
                        end: serveRange[1]
                    }));
                }

                // If we couldn't satisfy the entire request, push the client
                // into pendingRequests so we can append to the stream later
                if (serveRange[1] !== wishRange[1]) {
                } else {
                    client.songStream.end();
                }
                */
            } else {
                res.status(404).end('404 song not found');
            }
        });
    });

    callback(null, this);
}

util.inherits(Rest, Plugin);

module.exports = Rest;
