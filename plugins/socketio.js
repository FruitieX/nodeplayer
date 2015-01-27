var _ = require('underscore');

var socketio = {};
var config, player;

// called when nodeplayer is started to initialize the plugin
// do any necessary initialization here
socketio.init = function(_player, callback, errCallback) {
    player = _player;
    config = _player.config;

    if(!player.expressServer) {
        errCallback('module must be initialized after expressjs module!');
    } else {
        socketio.io = require('socket.io')(player.expressServer);
        socketio.io.on('connection', function(socket) {
            if(player.queue[0]) {
                socket.emit('playback', {
                    songID: player.queue[0].songID,
                    format: player.queue[0].format,
                    backendName: player.queue[0].backendName,
                    duration: player.queue[0].duration,
                    position: player.playbackPosition
                });
            }
            socket.emit('queue', player.queue);
        });

        player.socketio = socketio;

        console.log('listening on port ' + (process.env.PORT || config.port));
        callback();
    }
};

socketio.onSongChange = function(player) {
    socketio.io.emit('playback', {
        songID: player.queue[0].songID,
        format: player.queue[0].format,
        backendName: player.queue[0].backendName,
        duration: player.queue[0].duration,
        position: player.playbackPosition
    });
    socketio.io.emit('queue', player.queue);
};

socketio.onSongPause = function(player) {
    socketio.io.emit('playback', null);,
};

socketio.onQueueModify = function(player) {
    socketio.io.emit('queue', player.queue);
};

socketio.onEndOfQueue = function(player) {
    socketio.io.emit('playback', null);,
    socketio.io.emit('queue', player.queue);
};

module.exports = socketio;
