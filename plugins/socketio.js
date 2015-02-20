"use strict";

var _ = require('underscore');

var config, player, logger;

var playbackEvent = function(socket) {
    socket.emit('playback', player.queue[0] ? {
        songID: player.queue[0].songID,
        format: player.queue[0].format,
        backendName: player.queue[0].backendName,
        duration: player.queue[0].duration,
        position: player.playbackStart ? player.playbackPosition + (new Date() - player.playbackStart) : player.playbackPosition,
        playbackStart: player.playbackStart
    } : null);
};

var queueEvent = function(socket) {
    socket.emit('queue', player.queue);
};

// called when nodeplayer is started to initialize the plugin
// do any necessary initialization here
exports.init = function(_player, callback) {
    player = _player;
    config = _player.config;
    logger = _player.logger;

    if(!player.httpServer) {
        callback('module must be initialized after expressjs module!');
    } else {
        player.socketio = require('socket.io')(player.httpServer);
        player.socketio.on('connection', function(socket) {
            socket.on('addToQueue', function(data) {
                var err = player.addToQueue(data.songs, data.pos);
                socket.emit('addToQueueResult', err);
            });
            socket.on('removeFromQueue', function(data) {
                var err = player.removeFromQueue(data.pos, data.cnt);
                socket.emit('removeFromQueueResult', err);
            });
            socket.on('searchBackends', function(query) {
                player.searchBackends(query, function(results) {
                    socket.emit('searchBackendsResult', results);
                });
            });
            socket.on('startPlayback', player.startPlayback);
            socket.on('pausePlayback', player.pausePlayback);
            socket.on('skipSongs', player.skipSongs);
            socket.on('shuffleQueue', player.shuffleQueue);

            playbackEvent(socket);
            queueEvent(socket);
        });

        logger.info('listening on port ' + (process.env.PORT || config.port));
        callback();
    }
};

exports.onSongChange = function(song) {
    playbackEvent(player.socketio);
};

exports.onSongPause = function(song) {
    playbackEvent(player.socketio);
};

exports.onQueueModify = function(queue) {
    queueEvent(player.socketio);
};

exports.onEndOfQueue = function() {
    playbackEvent(player.socketio);
    queueEvent(player.socketio);
};
