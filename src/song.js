const _ = require('lodash');
const uuid = require('node-uuid');

/**
 * Constructor
 * @param {Song} song - Song details
 * @param {Backend} backend - Backend providing the audio
 * @throws {Error} in case of errors
 */
export default class Song {
  constructor(song, backend) {
    // make sure we have a reference to backend
    if (!backend || !_.isObject(backend)) {
      throw new Error('Song constructor called with invalid backend: ' + backend);
    }

    if (!song.duration || !_.isNumber(song.duration)) {
      throw new Error('Song constructor called without duration!');
    }
    if (!song.title || !_.isString(song.title)) {
      throw new Error('Song constructor called without title!');
    }
    if (!song.songId || !_.isString(song.songId)) {
      throw new Error('Song constructor called without songId!');
    }
    if (!song.score || !_.isNumber(song.score)) {
      throw new Error('Song constructor called without score!');
    }
    if (!song.format || !_.isString(song.format)) {
      throw new Error('Song constructor called without format!');
    }

    this.uuid = uuid.v4();

    this.title = song.title;
    this.artist = song.artist;
    this.album = song.album;
    this.albumArt = {
      lq: song.albumArt ? song.albumArt.lq : null,
      hq: song.albumArt ? song.albumArt.hq : null,
    };
    this.duration = song.duration;
    this.songId = song.songId;
    this.score = song.score;
    this.format = song.format;

    this.playback = {
      startTime: null,
      startPos: null,
    };

    // NOTE: internally to the Song we store a reference to the backend.
    // However when accessing the Song from the outside, we return only the
    // backend's name inside a backendName field.
    //
    // Any functions requiring access to the backend should be implemented as
    // members of the Song (e.g. isPrepared, prepareSong)
    this.backend = backend;

    // optional fields
    this.playlist = song.playlist;
  }

  /**
   * Set playback status as started at specified optional position
   * @param {Number} [pos] - position to start playing at
   */
  playbackStarted(pos) {
    this.playback = {
      startTime: new Date(),
      startPos: pos || null,
    };
  }

  /**
   * Return serialized details of the song
   * @return {SerializedSong} - serialized Song object
   */
  serialize() {
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
      backendName: this.backend.name,
      playlist: this.playlist,
      playback: this.playback,
    };
  }

  /**
   * Synchronously(!) returns whether the song is prepared or not
   * @return {Boolean} - true if song is prepared, false if not
   */
  isPrepared() {
    return this.backend.isPrepared(this);
  }

  /**
   * Prepare song for playback
   * @param {encodeCallback} callback - Called when song is ready or on error
   */
  prepare(callback) {
    this.backend.prepare(this, callback);
  }

  /**
   * Cancel song preparation if applicable
   */
  cancelPrepare() {
    this.backend.cancelPrepare(this);
  }
}
