"use strict";

var fs = require('fs');
var mkdirp = require('mkdirp');

var path = process.env.HOME + '/.nodeplayer/stored-queue.json';
var player, config;

exports.init = function(_player, _logger, callback) {
    player = _player;
    config = _player.config;

    mkdirp(process.env.HOME + '/.nodeplayer');
    if(fs.existsSync(path)) {
        player.queue = JSON.parse(fs.readFileSync(path));
    }

    callback();
};

exports.onBackendsInitialized = function() {
    player.prepareSongs();
};

exports.onQueueModify = function(queue) {
    fs.writeFileSync(path, JSON.stringify(player.queue, undefined, 4));
};
exports.postSongsRemoved = exports.onQueueModify;
