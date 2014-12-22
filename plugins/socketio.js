var express = require('express');
var bodyParser = require('body-parser');
var app = express();
var _ = require('underscore');

var socketio = {};
var config, player;

// called when partyplay is started to initialize the plugin
// do any necessary initialization here
socketio.init = function(_player, callback, errCallback) {
    player = _player;
    config = _player.config;

    socketio.io = require('socket.io')(server);
    socketio.io.on('connection', function(socket) {
        if(_playerState.nowPlaying) {
            socket.emit('playback', {
                songID: _playerState.nowPlaying.id,
                format: _playerState.nowPlaying.format,
                backend: _playerState.nowPlaying.backend,
                duration: _playerState.nowPlaying.duration,
                position: new Date() - _playerState.nowPlaying.playbackStart
            });
        }
        socket.emit('queue', [_playerState.nowPlaying, _playerState.queue]);
    });

    console.log('listening on port ' + (process.env.PORT || 8080));
    callback();
};

// updates to queue
socketio.onSongChange = function(player) {
    socketio.io.emit('playback', {
        songID: player.nowPlaying.id,
        format: player.nowPlaying.format,
        backend: player.nowPlaying.backend,
        duration: player.nowPlaying.duration
    });
};

socketio.postSongQueued = function(player) {
    socketio.io.emit('queue', [player.nowPlaying, player.queue]);
};
socketio.onNextSongPrepareError = socketio.postSongQueued;
socketio.onSongPrepareError = socketio.postSongQueued;
socketio.onSongEnd = socketio.postSongQueued;

module.exports = socketio;
