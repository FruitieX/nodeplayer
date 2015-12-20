var _ = require('underscore');
var Song = require('./song');

/**
 * Constructor
 * @param {Player} player - Parent player object reference
 * @returns {Error} - in case of errors
 */
function Queue(player) {
    if (!player || !_.isObject(player)) {
        throw new Error('Queue constructor called without player reference!');
    }

    this.unshuffledSongs = null;
    this.songs = [];
    this.player = player;
}

// TODO: hooks
// TODO: moveSongs

/**
 * Get serialized list of songs in queue
 * @return {[SerializedSong]} - List of songs in serialized format
 */
Queue.prototype.serialize = function() {
    var serialized = _.map(this.songs, function(song) {
        return song.serialize();
    });

    return serialized;
};

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
    }) || null;
};

/**
 * Find song UUID at given index
 * @param {Number} index - Look for song at this index
 * @returns {String|null} - UUID, null if not found
 */
Queue.prototype.uuidAtIndex = function(index) {
    var song = this.songs[index];
    return song ? song.uuid : null;
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
            return 'Song with UUID ' + at + ' not found!';
        }

        pos++; // insert after song
    }

    // generate Song objects of each song
    songs = _.map(songs, function(song) {
        var backend = this.player.backends[song.backendName];
        if (!backend) {
            throw new Error('Song constructor called with invalid backend: ' + song.backendName);
            return null;
        }

        return new Song(song, backend);
    }, this);

    // if we're still continuing regardless of errors above, remove invalid songs
    songs = _.filter(songs, _.identity);

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
        return 'Song with UUID ' + at + ' not found!';
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

        // restore unshuffled list
        this.songs = this.unshuffledSongs;

        this.unshuffledSongs = null;
    } else {
        // shuffle

        // store copy of current songs array
        this.unshuffledSongs = this.songs.slice();

        this.songs = _.shuffle(this.songs);
    }

    this.player.prepareSongs();
};

module.exports = Queue;
