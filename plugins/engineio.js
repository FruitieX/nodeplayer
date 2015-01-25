var _ = require('underscore');

var engineio = {};
var config, player;

// called when partyplay is started to initialize the plugin
// do any necessary initialization here
engineio.init = function(_player, callback, errCallback) {
    player = _player;
    config = _player.config;

    if(!player.expressServer) {
        errCallback('module must be initialized after expressjs module!');
    } else {
        engineio.io = require('engine.io').attach(player.expressServer);
        engineio.io.on('connection', function(socket) {
            console.log('connected');
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

        player.engineio = engineio;

        console.log('listening on port ' + (process.env.PORT || config.port));
        callback();
    }
};

// updates to queue
engineio.onSongChange = function(player) {
    engineio.io.emit('playback', {
        songID: player.queue[0].songID,
        format: player.queue[0].format,
        backendName: player.queue[0].backendName,
        duration: player.queue[0].duration
    });
    engineio.io.emit('queue', player.queue);
};

engineio.postSongQueued = function(player) {
    engineio.io.emit('queue', player.queue);
};
engineio.onNextSongPrepareError = engineio.postSongQueued;
engineio.onSongPrepareError = engineio.postSongQueued;

engineio.onEndOfQueue = function(player) {
    engineio.io.emit('playback', null);
    engineio.io.emit('queue', player.queue);
};

module.exports = engineio;
