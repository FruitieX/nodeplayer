var _ = require('underscore');

/**
 * Constructor
 * @param {String} name - Name of backend plugin that provides songs to nodeplayer
 * @param {Function} callback - Called once the backend has loaded
 */

function Backend(name, callback) {
    this.name = name;
    this.songsPreparing = [];
    this.plugin = require('nodeplayer-backend-' + name);
};

/**
 * Synchronously(!) returns whether the song with songId is prepared or not
 * @param {String} songId - Backend identifies song by this ID
 * @returns {Boolean} - true if song is prepared, false if not
 */
Backend.prototype.songPrepared = function(songId) {
    return this.plugin.songPrepared(songId);
};

module.exports = Backend;
