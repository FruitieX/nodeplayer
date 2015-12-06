var _ = require('underscore');

/**
 * Super constructor for backends
 */
function Backend() {
    this.name = this.constructor.name.toLowerCase();
    this.songsPreparing = [];
}

/**
 * Synchronously(!) returns whether the song with songId is prepared or not
 * @param {String} songId - Backend identifies song by this ID
 * @returns {Boolean} - true if song is prepared, false if not
 */
Backend.prototype.songPrepared = function(songId) {
    // TODO: move to module
    return this.module.songPrepared(songId);
};

module.exports = Backend;
