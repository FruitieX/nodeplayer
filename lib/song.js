var _ = require('underscore');
var uuid = require('node-uuid');

/**
 * Constructor
 * @param {Song} song - Song details
 * @param {Backend} backend - Backend providing the audio
 * @returns {Error} - in case of errors
 */
function Song(song, backend) {
    // make sure we have a reference to backend
    if (!backend || !_.isObject(backend)) {
        return new Error('Song constructor called without backend!');
    }

    if (!song.duration || !_.isNumber(song.duration)) {
        return new Error('Song constructor called without duration!');
    }
    if (!song.title || !_.isString(song.title)) {
        return new Error('Song constructor called without title!');
    }
    if (!song.songId || !_.isString(song.songId)) {
        return new Error('Song constructor called without songId!');
    }
    if (!song.backendName || !_.isString(song.backendName)) {
        return new Error('Song constructor called without backendName!');
    }
    if (!song.score || !_.isNumber(song.score)) {
        return new Error('Song constructor called without score!');
    }
    if (!song.format || !_.isString(song.format)) {
        return new Error('Song constructor called without format!');
    }

    this.uuid = uuid.v4();

    this.title = song.title;
    this.artist = song.artist;
    this.album = song.album;
    this.albumArt = {
        lq: song.albumArt ? song.albumArt.lq : null,
        hq: song.albumArt ? song.albumArt.hq : null
    };
    this.duration = song.duration;
    this.songId = song.songId;
    this.score = song.score;
    this.format = song.format;

    this.backend = song.backend;
}

/**
 * Return details of the song
 * @returns {Song} - simplified Song object
 */
Song.prototype.details = function() {
    return {
        uuid: this.uuid,
        title: this.title,
        artist: this.artist,
        album: this.album,
        albumArt: this.albumArt,
        duration: this.duration,
        songId: this.songId,
        score: this.score,
        format: this.format,
        backendName: this.backend.name
    };
};

/**
 * Synchronously(!) returns whether the song is prepared or not
 * @returns {Boolean} - true if song is prepared, false if not
 */
Song.prototype.isPrepared = function() {
    return this.backend.songPrepared(this.songId);
};

/**
 * Prepare song for playback
 * @param {Function} callback - Called when song is ready or if an error occurred
 */
Song.prototype.prepare = function(callback) {
    if (this.isPrepared()) {
        callback();
    } else {
        // TODO: move Player.prototype.prepareSong logic here
    }
};

module.exports = Song;
