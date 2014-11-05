var mkdirp = require('mkdirp');
var send = require('send');

var dummyBackend = {};

// TODO: remove this, temporary test
var config;

var fs = require('fs');

// cache songID to disk.
// on success: callback must be called with file path as argument
// on failure: errCallback must be called with error message
dummyBackend.cache = function(songID, callback, errCallback) {
    console.log("dummyBackend.cache");
    var filePath = config.songCachePath + '/dummy/music.mp3';

    if(fs.existsSync(filePath)) {
        // song was found from cache
        if(callback)
            callback(filePath);
        return;
    } else {
        // song had to be downloaded
        // simulate with arbitrary 3 second delay
        setTimeout(function() {
            callback(filePath);
        }, 3000);
    }
};
dummyBackend.search = function(terms, callback, errCallback) {
    callback(JSON.parse('[ {"title":"song1","artist":"qwerty","album":"derpy hits","id":"abc","duration":"60000","backend":"dummy"},\
    {"title":"song2","artist":"qwerty","album":"derpy hits","id":"def","duration":"50000","backend":"dummy"} ]'));
};
dummyBackend.init = function(_config, callback) {
console.log("dummyBackend.init");
    config = _config;
    mkdirp(config.songCachePath + '/dummy');
};
dummyBackend.middleware = function(req, res, next) {
    console.log("dummyBackend.middleware");
    send(req, "music.mp3", {
        dotfiles: 'allow',
        root: config.songCachePath + '/dummy'
    }).pipe(res);
};
module.exports = dummyBackend;
