var _ = require('underscore');

var socketio = {};
var config, player;

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
socketio.init = function(_player, callback) {
    player = _player;
    config = _player.config;

    if(!player.httpServer) {
        callback('module must be initialized after expressjs module!');
    } else {
        socketio.io = require('socket.io')(player.httpServer);
        socketio.io.on('connection', function(socket) {
            playbackEvent(socket);
            queueEvent(socket);
        });

        player.socketio = socketio;

        console.log('listening on port ' + (process.env.PORT || config.port));
        callback();
    }
};

socketio.onSongChange = function(song) {
    playbackEvent(socketio.io);
};

socketio.onSongPause = function(song) {
    playbackEvent(socketio.io);
};

socketio.onQueueModify = function(queue) {
    queueEvent(socketio.io);
};

socketio.onEndOfQueue = function() {
    playbackEvent(socketio.io);
    queueEvent(socketio.io);
};

module.exports = socketio;
