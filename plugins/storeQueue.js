"use strict";

var fs = require('fs');
var mkdirp = require('mkdirp');
var _ = require('underscore');

var path = process.env.HOME + '/.nodeplayer/stored-queue.json';
var player, config, logger;

exports.init = function(_player, _logger, callback) {
    player = _player;
    config = _player.config;
    logger = _logger;

    mkdirp(process.env.HOME + '/.nodeplayer');
    try {
        player.queue = require(path);
        _.each(player.queue, function(song) {
            logger.verbose('added stored song to queue: ' + song.songID);
        });
    } catch(e) {
        logger.warn('no stored queue found');
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
