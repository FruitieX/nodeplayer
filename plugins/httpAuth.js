var auth = require('http-auth');
var fs = require('fs');

var httpAuth = {};
var config, player;

// called when nodeplayer is started to initialize the plugin
// do any necessary initialization here
httpAuth.init = function(_player, callback) {
    player = _player;
    config = _player.config;

    var basic = auth.basic({
            realm: "partyplay listener"
        }, function (username, password, callback) {
            callback(username === config.username && password === config.password);
        }
    );

    // put /song/* behind authentication for now
    // TODO: configurable which paths require authentication?
    player.app.use('/song/*', auth.connect(basic));
    callback();
};

module.exports = httpAuth;
