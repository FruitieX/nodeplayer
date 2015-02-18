var crypto = require('crypto');
var fs = require('fs');

exports.init = function(_player, callback) {
    player = _player;
    config = _player.config;

    var key = fs.readFileSync(config.verifyMac.key);
    derivedKey = crypto.pbkdf2Sync(key, key, config.verifyMac.iterations, config.verifyMac.keyLen);
    callback();
};

exports.calculateMac = function(str) {
    var hmac = crypto.createHmac(config.verifyMac.algorithm, derivedKey);
    hmac.update(str);
    return hmac.digest('hex');
};

exports.verify = function(str, hmac) {
    var calculatedHmac = exports.calculateMac(str);
    return (hmac === calculatedHmac);
};

exports.getSongHmac = function(song) {
    song.album = (song.album || "");
    song.artist = (song.artist || "");
    song.title = (song.title || "");

    return exports.calculateMac(
        song.album.replace('|', '')                  + '|' +
        song.artist.replace('|', '')                 + '|' +
        song.title.replace('|', '')                  + '|' +
        song.backendName.replace('|', '')            + '|' +
        song.duration.toString().replace('|', '')    + '|' +
        song.format.replace('|', '')                 + '|' +
        song.songID.replace('|', '')                 + '|'
    );
};

exports.verifySong = function(song) {
    var calculatedHmac = exports.getSongHmac(song);
    return (song.hmac === calculatedHmac);
};

exports.preAddSearchResult = function(song) {
    song.hmac = exports.getSongHmac(song);
};

exports.preSongQueued = function(song) {
    return (exports.verifySong(song) ? null : "invalid hmac!");
};
