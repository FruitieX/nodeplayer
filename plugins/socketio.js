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
            if(player.queue[0]) {
                socket.emit('playback', {
                    songID: player.queue[0].songID,
                    format: player.queue[0].format,
                    backendName: player.queue[0].backendName,
                    duration: player.queue[0].duration,
                    position: new Date() - player.queue[0].playbackStart
                });
            }
            socket.emit('queue', player.queue);
        });

        player.socketio = socketio;

        console.log('listening on port ' + (process.env.PORT || config.port));
        callback();
    }
};

// updates to queue
socketio.onSongChange = function(player) {
    socketio.io.emit('playback', {
        songID: player.queue[0].songID,
        format: player.queue[0].format,
        backendName: player.queue[0].backendName,
        duration: player.queue[0].duration
    });
    socketio.io.emit('queue', player.queue);
};

socketio.postSongQueued = function(player) {
    socketio.io.emit('queue', player.queue);
};
socketio.onNextSongPrepareError = socketio.postSongQueued;
socketio.onSongPrepareError = socketio.postSongQueued;

socketio.onEndOfQueue = function(player) {
    socketio.io.emit('playback', null);
    socketio.io.emit('queue', player.queue);
};

module.exports = socketio;
