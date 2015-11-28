var _ = require('underscore');

/**
 * Constructor
 * @param {Player} player - Parent player object reference
 * @returns {Error} - in case of errors
 */
function Queue(player) {
    if (!player || !_.isObject(player)) {
        return new Error('Queue constructor called without player reference!');
    }

    this.unshuffledSongs = null;
    this.songs = [];
    this.player = player;
}

// TODO: hooks
// TODO: moveSongs

/**
 * Find index of song in queue
 * @param {String} at - Look for song with this UUID
 * @returns {Number} - Index of song, -1 if not found
 */
Queue.prototype.findSongIndex = function(at) {
    return _.findIndex(this.songs, function(song) {
        return song.uuid === at;
    });
};

/**
 * Find song in queue
 * @param {String} at - Look for song with this UUID
 * @returns {Song|null} - Song object, null if not found
 */
Queue.prototype.findSong = function(at) {
    return _.find(this.songs, function(song) {
        return song.uuid === at;
    });
};

/**
 * Returns queue length
 * @returns {Number} - Queue length
 */
Queue.prototype.getLength = function() {
    return this.songs.length;
};

/**
 * Insert songs into queue
 * @param {String | null} at - Insert songs after song with this UUID
 *                      (null = start of queue)
 * @param {Object[]} songs - List of songs to insert
 * @return {Error} - in case of errors
 */
Queue.prototype.insertSongs = function(at, songs) {
    var pos;
    if (at === null) {
        // insert at start of queue
        pos = 0;
    } else {
        // insert song after song with UUID
        pos = this.findSongIndex(at);

        if (pos < 0) {
            return new Error('Song with UUID ' + at + ' not found!');
        }

        pos++; // insert after song
    }

    // generate UUIDs for each song
    _.each(songs, function(song) {
        song.uuid = uuid.v4();
    });

    // perform insertion
    var args = [pos, 0].concat(songs);
    Array.prototype.splice.apply(this.songs, args);

    this.player.prepareSongs();
};

/**
 * Removes songs from queue
 * @param {String} at - Start removing at song with this UUID
 * @param {Number} cnt - Number of songs to delete
 * @return {Song[] | Error} - List of removed songs, Error in case of errors
 */
Queue.prototype.removeSongs = function(at, cnt) {
    var pos = this.findSongIndex(at);
    if (pos < 0) {
        return new Error('Song with UUID ' + at + ' not found!');
    }

    // cancel preparing all songs to be deleted
    for (var i = pos; i < pos + cnt && i < this.songs.length; i++) {
        var song = this.songs[i];
        if (song.cancelPrepare) {
            song.cancelPrepare('Song removed.');
        }
    }

    // store index of now playing song
    var np = this.player.nowPlaying;
    var npIndex = np ? this.findSongIndex(np.uuid) : -1;

    // perform deletion
    var removed = this.songs.splice(pos, cnt);

    // was now playing removed?
    if (pos <= npIndex && pos + cnt >= npIndex) {
        // change to first song after splice
        var newNp = this.songs[pos];
        this.player.changeSong(newNp ? newNp.uuid : null);
    } else {
        this.player.prepareSongs();
    }

    return removed;
};

/**
 * Toggle queue shuffling
 */
Queue.prototype.shuffle = function() {
    var nowPlaying;

    if (this.unshuffledSongs) {
        // unshuffle

        // store now playing
        nowPlaying = this.getNowPlaying();

        // restore unshuffled list
        this.songs = this.unshuffledSongs;

        // find new now playing index by UUID, update curQueuePos
        this.curQueuePos = this.findSongIndex(nowPlaying.uuid);

        this.unshuffledSongs = null;
    } else {
        // shuffle

        // store copy of current songs array
        this.unshuffledSongs = this.songs.slice();

        // store now playing
        nowPlaying = this.songs.splice(this.curQueuePos, 1);

        this.songs = _.shuffle(this.songs);

        // re-insert now playing
        this.songs.splice(this.curQueuePos, 0, nowPlaying);
    }

    this.player.prepareSongs();
};

module.exports = Queue;
