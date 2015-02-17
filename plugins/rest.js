var bodyParser = require('body-parser');
var _ = require('underscore');
var url = require('url');
var send = require('send');
var fs = require('fs');
var mime = require('mime');
var meter = require('stream-meter');

var rest = {};
var config, player;

var sendResponse = function(res, msg, err) {
    if(err)
        res.status(404).send(err);
    else
        res.send(msg);
};

// called when nodeplayer is started to initialize the backend
// do any necessary initialization here
rest.init = function(_player, callback) {
    player = _player;
    config = _player.config;

    if(!player.app) {
        callback('module must be initialized after expressjs module!');
    } else {
        player.app.get('/queue', function(req, res) {
            res.send(JSON.stringify(player.queue));
        });

        // TODO: get rid of the partyplay specific userID here
        // queue song
        player.app.post('/queue', bodyParser.json({limit: '100mb'}), function(req, res) {
            var err = player.addToQueue(req.body.songs, req.body.pos);
            sendResponse(res, 'success', err);
        });

        player.app.delete('/queue/:pos', bodyParser.json({limit: '100mb'}), function(req, res) {
            var songs = player.removeFromQueue(req.params.pos, req.body.cnt);
            sendResponse(res, songs, null);
        });

        player.app.post('/playctl', bodyParser.json({limit: '100mb'}), function(req, res) {
            var action = req.body.action;
            var cnt = req.body.cnt;

            if(action === 'play') {
                player.startPlayback(req.body.position);
            } else if(action === 'pause') {
                player.pausePlayback();
            } else if(action === 'skip') {
                player.skipSongs(cnt);
            } else if(action === 'shuffle') {
                player.shuffleQueue();
            }

            res.send('success');
        });

        // search for song with given search terms
        player.app.post('/search', bodyParser.json({limit: '100mb'}), function(req, res) {
            console.log('got search request: ' + req.body.terms);

            player.searchBackends(req.body.terms, function(results) {
                res.send(JSON.stringify(results));
            });
        });

        // so other modules can easily see that this module is loaded
        player.rest = true;

        callback();
    }
};

var pendingReqHandlers = [];
rest.onPrepareProgress = function(song, dataSize, done) {
    for(var i = pendingReqHandlers.length - 1; i >= 0; i--) {
        pendingReqHandlers.pop()();
    };
};

var getFilesizeInBytes = function(filename) {
    if(fs.existsSync(filename)) {
        var stats = fs.statSync(filename);
        var fileSizeInBytes = stats["size"];
        return fileSizeInBytes;
    } else {
        return -1;
    }
}

var getPath = function(player, songID, backendName, songFormat) {
    if(player.songsPreparing[backendName] && player.songsPreparing[backendName][songID]) {
        return config.songCachePath + '/' + backendName + '/incomplete/' + songID + '.' + songFormat;
    } else {
        return config.songCachePath + '/' + backendName + '/' + songID + '.' + songFormat;
    }
};

rest.onBackendInitialized = function(backend) {
    // expressjs middleware for requesting music data
    // must support ranges in the req, and send the data to res
    player.app.get('/song/' + backend.name + '/:fileName', function(req, res, next) {
        var songID = req.params.fileName.substring(0, req.params.fileName.lastIndexOf('.'));
        var songFormat = req.params.fileName.substring(req.params.fileName.lastIndexOf('.') + 1);
        res.setHeader('Transfer-Encoding', 'chunked');
        res.setHeader('Content-Type', 'audio/ogg; codecs=opus');
        //res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Accept-Ranges', 'bytes');
        //res.setHeader('Connection', 'keep-alive');

        var range = [0];
        if(req.headers.range) {
            range = req.headers.range.substr(req.headers.range.indexOf('=') + 1).split('-');
            // TODO: only 206 used right now
            //if(range[0] != 0 || range[1]) {
            // try guessing at least some length for the song to keep chromium happy
            res.statusCode = 206;
            var path = getPath(player, songID, backend.name, songFormat);

            // a best guess for the header
            var end;
            if(range[1]) {
                end = Math.min(range[1], getFilesizeInBytes(path) - 1);
            } else {
                end = getFilesizeInBytes(path) - 1;
            }

            // total file size, if known
            var outOf = '*';
            if(!player.songsPreparing[backend.name] || !player.songsPreparing[backend.name][songID]) {
                outOf = end + 1;
            }
            res.setHeader('Content-Range', 'bytes ' + range[0] + '-' + end + '/' + outOf);
            //}
        }

        console.log('got streaming request for song: ' + songID + ', range: ' + range);

        var doSend = function(offset) {
            //console.log('doSend(' + offset + ')');
            var m = meter();

            // TODO: this may have race condition issues causing the end of a song to be cut out
            var path = getPath(player, songID, backend.name, songFormat);

            if(fs.existsSync(path)) {
                var end;
                if(range[1]) {
                    end = Math.min(range[1], getFilesizeInBytes(path) - 1);
                } else {
                    end = getFilesizeInBytes(path) - 1;
                }

                if(offset > end) {
                    if(range[1] && range[1] <= offset) {
                        // range request was fullfilled
                        res.end();
                    } else if(player.songsPreparing[backend.name] && player.songsPreparing[backend.name][songID]) {
                        // song is still preparing, there is more data to come
                        //console.log('enough data not yet available');
                        pendingReqHandlers.push(function() {
                            doSend(offset);
                        });
                    } else if ((getFilesizeInBytes(path) - 1) <= offset){
                        // song fully prepared and sent
                        res.end();
                    } else {
                        // bad range
                        res.status(416).end();
                    }
                } else {
                    // data is available, let's send as much as we can
                    var sendStream = fs.createReadStream(path, {
                        start: offset,
                        end: end
                    });
                    sendStream.pipe(m).pipe(res, {end: false});

                    // end of file hit, run doSend again with new offset
                    m.on('end', function() {
                        // close old pipes
                        sendStream.unpipe();
                        m.unpipe();

                        doSend(m.bytes + offset);
                    });
                }
            } else {
                console.log('file not found: ' + path);
                res.status(404).end();
            }
        };

        doSend(parseInt(range[0]));
    });
};

module.exports = rest;
