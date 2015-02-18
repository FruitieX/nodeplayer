var express = require('express');

exports.init = function(_player, callback) {
    player = _player;
    config = _player.config;

    if(!player.app) {
        callback('module must be initialized after expressjs module!');
    } else if(!player.plugins.socketio) {
        // weblistener client depends on socketio module
        callback('module must be initialized after socketio module!');
    } else if(!player.plugins.rest) {
        // weblistener client depends on rest module
        callback('module must be initialized after rest module!');
    } else {
        player.app.use('/weblistener', express.static(__dirname + '/weblistener'));

        callback();
    }
};
