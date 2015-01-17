var express = require('express');
var bodyParser = require('body-parser');
var _ = require('underscore');

var playlistmanager = {};

playlistmanager.init = function(_player, callback, errCallback) {
    player = _player;
    config = _player.config;

    if(!player.expressApp) {
        errCallback('module must be initialized after expressjs module!');
    } else if(!player.rest) {
        // playlistmanager client depends on rest module
        errCallback('module must be initialized after rest module!');
    } else {
        player.expressApp.post('/queue/skip', bodyParser.json(), function(req, res) {
            var err = player.addToQueue(req.body.song, {
                userID: req.body.userID
            });
            if(err)
                res.status(404).send(err);
            else
                res.send('success');
        });
        player.expressApp.post('/queue/seek', bodyParser.json(), function(req, res) {
            // implement me
        });
        player.expressApp.post('/queue/swap', bodyParser.json(), function(req, res) {
            // implement me
        });
    }

    callback();
};

module.exports = playlistmanager;
