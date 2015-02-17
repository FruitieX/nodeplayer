var verifyMac = {};
var crypto = require('crypto');
var fs = require('fs');

verifyMac.init = function(_player, callback) {
    player = _player;
    config = _player.config;

    verifyMac.derivedKey;

    if(!player.rest) {
        callback('module must be initialized after rest module!');
    } else {
        var key = fs.readFileSync(config.verifyMac.key);
        derivedKey = crypto.pbkdf2Sync(key, key, config.verifyMac.iterations, config.verifyMac.keyLen);
        callback();
    }
};

verifyMac.calculateMac = function(str) {
    var hmac = crypto.createHmac(config.verifyMac.algorithm, derivedKey);
    hmac.update(str);
    return hmac.digest('hex');
};

verifyMac.verify = function(str, hmac) {
    var calculatedHmac = verifyMac.calculateMac(str);
    return (hmac === calculatedHmac);
};

verifyMac.getSongHmac = function(song) {
    song.album = (song.album || "");
    song.artist = (song.artist || "");
    song.title = (song.title || "");

    return verifyMac.calculateMac(
        song.album.replace('|', '')                  + '|' +
        song.artist.replace('|', '')                 + '|' +
        song.title.replace('|', '')                  + '|' +
        song.backendName.replace('|', '')            + '|' +
        song.duration.toString().replace('|', '')    + '|' +
        song.format.replace('|', '')                 + '|' +
        song.songID.replace('|', '')                 + '|'
    );
};

verifyMac.verifySong = function(song) {
    var calculatedHmac = verifyMac.getSongHmac(song);
    return (song.hmac === calculatedHmac);
};

verifyMac.preAddSearchResult = function(player, song) {
    song.hmac = verifyMac.getSongHmac(song);
};

verifyMac.preSongQueued = function(song) {
    return (verifyMac.verifySong(song) ? null : "invalid hmac!");
};

module.exports = verifyMac;
