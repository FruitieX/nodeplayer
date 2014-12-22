var mkdirp = require('mkdirp');

var dummyBackend = {};
dummyBackend.name = 'dummy';

var config, player;

var fs = require('fs');

// cache songID to disk.
// on success: song must be stored in config.songCachePath + '/' + backend.name,
//             then callback must be called
// on failure: errCallback must be called with error message
dummyBackend.prepareSong = function(songID, callback, errCallback) {
    console.log("dummyBackend.cache");
    var filePath = config.songCachePath + '/dummy/music.mp3';

    if(fs.existsSync(filePath)) {
        // song was found from cache
        if(callback)
            callback();
        return;
    } else {
        // song had to be downloaded
        // simulate with arbitrary 3 second delay
        setTimeout(function() {
            callback();
        }, 500);
    }
};

dummyBackend.search = function(terms, callback, errCallback) {
    callback(JSON.parse('[ {"title":"song1","artist":"qwerty","album":"derpy hits","id":"abc","duration":"60000","backend":"dummy"},\
    {"title":"song2","artist":"qwerty","album":"derpy hits","id":"def","duration":"50000","backend":"dummy"} ]'));
};

dummyBackend.init = function(_player, callback) {
    player = _player;
    config = _player.config;

    console.log("dummyBackend.init");
    config = _config;
    mkdirp(config.songCachePath + '/dummy');
};

module.exports = dummyBackend;
