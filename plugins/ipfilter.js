var filter = require('express-ipfilter');

var ipfilter = {};

ipfilter.init = function(_player, callback) {
    player = _player;
    config = _player.config;

    if(!player.app) {
        callback('module must be initialized after expressjs module!');
    } else {
        // TODO: separate config file for plugins?
        var checkIP = filter(config.filterStreamIPs, {mode: config.filterAction, log: config.log, cidr: true});
        player.app.use('/song', checkIP);

        callback();
    }
};

module.exports = ipfilter;
