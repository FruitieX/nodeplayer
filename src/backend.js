const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const config = require('./config').getConfig();
const labeledLogger = require('./logger');

/**
 * Super constructor for backends
 */
export default class Backend {
  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.log = labeledLogger(this.name);
    this.songsPreparing = {};
  }

  /**
   * Callback for reporting encoding progress
   * @callback encodeCallback
   * @param {Error} err - If truthy, an error occurred and preparation cannot continue
   * @param {Buffer} bytesWritten - How many new bytes was written to song.data
   * @param {Bool} done - True if this was the last chunk
   */

  /**
   * Encode stream as opus
   * @param {Stream} stream - Input stream
   * @param {Number} seek - Skip to this position in song (TODO)
   * @param {Song} song - Song object whose audio is being encoded
   * @param {encodeCallback} callback - Called when song is ready or on error
   * @return {Function} - Can be called to terminate encoding
   */
  encodeSong(stream, seek, song, callback) {
    const self = this;

    const encodedPath = path.join(config.songCachePath, self.name,
                                  song.songId + '.opus');

    const command = ffmpeg(stream)
      .noVideo()
      // .inputFormat('mp3')
      // .inputOption('-ac 2')
      .audioCodec('libopus')
      .audioBitrate('192')
      .format('opus')
      .on('error', err => {
        self.log.error(self.name + ': error while transcoding ' + song.songId + ': ' + err);
        delete song.prepare.data;
        callback(err);
      });

    const opusStream = command.pipe(null, { end: true });
    opusStream.on('data', chunk => {
      // TODO: this could be optimized by using larger buffers
      // song.prepare.data = Buffer.concat([song.prepare.data, chunk], song.prepare.data.length + chunk.length);

      if (chunk.length <= song.prepare.data.length - song.prepare.dataPos) {
        // If there's room in the buffer, write chunk into it
        chunk.copy(song.prepare.data, song.prepare.dataPos);
        song.prepare.dataPos += chunk.length;
      } else {
        // Otherwise allocate more room, then copy chunk into buffer

        // Make absolutely sure that the chunk will fit inside new buffer
        const newSize = Math.max(song.prepare.data.length * 2,
                  song.prepare.data.length + chunk.length);

        self.log.debug('Allocated new song data buffer of size: ' + newSize);

        const buf = new Buffer.allocUnsafe(newSize);

        song.prepare.data.copy(buf);
        song.prepare.data = buf;

        chunk.copy(song.prepare.data, song.prepare.dataPos);
        song.prepare.dataPos += chunk.length;
      }

      callback(null, chunk.length, false);
    });
    opusStream.on('end', () => {
      fs.writeFile(encodedPath, song.prepare.data, err => {
        self.log.verbose('transcoding ended for ' + song.songId);

        delete song.prepare;
        // TODO: we don't know if transcoding ended successfully or not,
        // and there might be a race condition between errCallback deleting
        // the file and us trying to move it to the songCache
        // TODO: is this still the case?
        // (we no longer save incomplete files on disk)

        callback(null, null, true);
      });
    });

    self.log.verbose('transcoding ' + song.songId + '...');

    // return a function which can be used for terminating encoding
    return err => {
      command.kill();
      self.log.verbose(self.name + ': canceled preparing: ' + song.songId + ': ' + err);
      delete song.prepare;
      callback(new Error('canceled preparing: ' + song.songId + ': ' + err));
    };
  }

  /**
   * Cancel song preparation if applicable
   * @param {Song} song - Song to cancel
   */
  cancelPrepare(song) {
    if (this.songsPreparing[song.songId]) {
      this.log.info('Canceling song preparing: ' + song.songId);
      this.songsPreparing[song.songId].cancel();
    } else {
      this.log.error('cancelPrepare() called on song not in preparation: ' + song.songId);
    }
  }

  // dummy functions

  /**
   * Callback for reporting song duration
   * @callback durationCallback
   * @param {Error} err - If truthy, an error occurred
   * @param {Number} duration - Duration in milliseconds
   */

  /**
   * Returns length of song
   * @param {Song} song - Query concerns this song
   * @param {durationCallback} callback - Called with duration
   */
  getDuration(song, callback) {
    const err = 'FATAL: backend does not implement getDuration()!';
    this.log.error(err);
    callback(err);
  }

  /**
   * Synchronously(!) returns whether the song with songId is prepared or not
   * @param {Song} song - Query concerns this song
   * @return {Boolean} - true if song is prepared, false if not
   */
  isPrepared(song) {
    this.log.error('FATAL: backend does not implement songPrepared()!');
    return false;
  }

  /**
   * Prepare song for playback
   * @param {Song} song - Song to prepare
   * @param {encodeCallback} callback - Called when song is ready or on error
   */
  prepare(song, callback) {
    this.log.error('FATAL: backend does not implement prepare()!');
    callback(new Error('FATAL: backend does not implement prepare()!'));
  }

  /**
   * Search for songs
   * @param {Object} query - Search terms
   * @param {String} [query.artist] - Artist
   * @param {String} [query.title] - Title
   * @param {String} [query.album] - Album
   * @param {Boolean} [query.any] - Match any of the above, otherwise all fields have to match
   * @param {Function} callback - Called with error or results
   */
  search(query, callback) {
    this.log.error('FATAL: backend does not implement search()!');
    callback(new Error('FATAL: backend does not implement search()!'));
  }
}

