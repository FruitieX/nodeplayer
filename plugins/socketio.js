var _ = require('underscore');

var socketio = {};
var config, player;

// called when partyplay is started to initialize the plugin
// do any necessary initialization here
socketio.init = function(_player, callback, errCallback) {
    player = _player;
    config = _player.config;

    if(!player.expressServer) {
        errCallback('module must be initialized after expressjs module!');
    } else {
        socketio.io = require('socket.io')(player.expressServer);
        socketio.io.on('connection', function(socket) {
            if(player.nowPlaying) {
                socket.emit('playback', {
                    songID: player.nowPlaying.songID,
                    format: player.nowPlaying.format,
                    backendName: player.nowPlaying.backendName,
                    duration: player.nowPlaying.duration,
                    position: new Date() - player.nowPlaying.playbackStart
                });
            }
            socket.emit('queue', [player.nowPlaying, player.queue]);
        });

        player.socketio = socketio;

        console.log('listening on port ' + (process.env.PORT || 8080));
        callback();
    }
};

// updates to queue
socketio.onSongChange = function(player) {
    socketio.io.emit('playback', {
        songID: player.nowPlaying.songID,
        format: player.nowPlaying.format,
        backendName: player.nowPlaying.backendName,
        duration: player.nowPlaying.duration
    });
    socketio.io.emit('queue', [player.nowPlaying, player.queue]);
};

socketio.postSongQueued = function(player) {
    socketio.io.emit('queue', [player.nowPlaying, player.queue]);
};
socketio.onNextSongPrepareError = socketio.postSongQueued;
socketio.onSongPrepareError = socketio.postSongQueued;

socketio.onEndOfQueue = function(player) {
    socketio.io.emit('queue', [null, null]);
};

module.exports = socketio;
