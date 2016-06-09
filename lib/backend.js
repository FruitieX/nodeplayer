var _ = require('underscore');
var path = require('path');
var config = require('./config').getConfig();
var labeledLogger = require('./logger');

/**
 * Super constructor for backends
 */
function Backend() {
    this.name = this.constructor.name.toLowerCase();
    this.log = labeledLogger(this.name);
    this.log.info('initializing...');
    this.songsPreparing = [];
}

/**
 * Callback for reporting encoding progress
 * @callback encodeCallback
 * @param {Error} err - Was there an error?
 * @param {Buffer} chunk - New data since last call
 * @param {Bool} done - True if this was the last chunk
 */

/**
 * Encode stream as opus
 * @param {Stream} stream - Input stream
 * @param {Number} seek - Skip to this position in song (TODO)
 * @param {Song} song - Song object whose audio is being encoded
 * @param {encodeCallback} callback - Callback for reporting encoding progress
 * @returns {Function} - Can be called to terminate encoding
 */
Backend.prototype.encodeSong = function(stream, seek, song, callback) {
    var self = this;

    var incompletePath = path.join(config.songCachePath, 'file', 'incomplete',
                                   song.songId + '.opus');

    var incompleteStream = fs.createWriteStream(incompletePath, {flags: 'w'});

    var encodedPath = path.join(config.songCachePath, 'file',
                                song.songId + '.opus');

    var command = ffmpeg(stream)
        .noVideo()
        //.inputFormat('mp3')
        //.inputOption('-ac 2')
        .audioCodec('libopus')
        .audioBitrate('192')
        .format('opus')
        .on('error', function(err) {
            self.log.error('file: error while transcoding ' + song.songId + ': ' + err);
            if (fs.existsSync(incompletePath)) {
                fs.unlinkSync(incompletePath);
            }
            callback(err);
        });

    var opusStream = command.pipe(null, {end: true});
    opusStream.on('data', function(chunk) {
        incompleteStream.write(chunk, undefined, function() {
            callback(null, chunk, false);
        });
    });
    opusStream.on('end', function() {
        incompleteStream.end(undefined, undefined, function() {
            self.log.verbose('transcoding ended for ' + song.songId);

            // TODO: we don't know if transcoding ended successfully or not,
            // and there might be a race condition between errCallback deleting
            // the file and us trying to move it to the songCache
            // TODO: is this still the case?

            // atomically move result to encodedPath
            if (fs.existsSync(incompletePath)) {
                fs.renameSync(incompletePath, encodedPath);
            }
            // TODO: (and what if this fails?)

            callback(null, null, true);
        });
    });

    self.log.verbose('transcoding ' + song.songId + '...');

    // return a function which can be used for terminating encoding
    return function(err) {
        command.kill();
        self.log.verbose('file: canceled preparing: ' + song.songId + ': ' + err);
        if (fs.existsSync(incompletePath)) {
            fs.unlinkSync(incompletePath);
        }
        callback(new Error('canceled preparing: ' + song.songId + ': ' + err));
    };
};

// dummy functions

/**
 * Synchronously(!) returns whether the song with songId is prepared or not
 * @param {Song} song - Query concerns this song
 * @returns {Boolean} - true if song is prepared, false if not
 */
Backend.prototype.isPrepared = function(song) {
    this.log.error('FATAL: backend does not implement songPrepared()!');
    return false;
};

/**
 * Prepare song for playback
 * @param {Song} song - Song to prepare
 * @param {Function} callback - Called when song is ready or on error
 */
Backend.prototype.prepare = function(song, callback) {
    this.log.error('FATAL: backend does not implement prepare()!');
    callback(new Error('FATAL: backend does not implement prepare()!'));
};

/**
 * Search for songs
 * @param {Object} query - Search terms
 * @param {String} [query.artist] - Artist
 * @param {String} [query.title] - Title
 * @param {String} [query.album] - Album
 * @param {Boolean} [query.any] - Match any of the above, otherwise all fields have to match
 * @param {Function} callback - Called with error or results
 */
Backend.prototype.search = function(query, callback) {
    this.log.error('FATAL: backend does not implement search()!');
    callback(new Error('FATAL: backend does not implement search()!'));
};

module.exports = Backend;
