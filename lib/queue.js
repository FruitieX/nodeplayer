var _ = require('underscore');

/**
 * Constructor
 * @param {Function} modifyCallback - Called whenever the queue is modified
 * @returns {Error} - in case of errors
 */
function Queue(callHooks) {
    if (!callHooks || !_.isFunction(callHooks)) {
        return new Error('Queue constructor called without a callHooks function!');
    }

    this.unshuffledSongs = undefined;
    this.songs = [];
    this.curQueuePos = -1;
    this.playbackStart = -1;
    this.playbackPosition = -1;
    this.callHooks = callHooks;
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
 * @returns {Song|undefined} - Song object, undefined if not found
 */
Queue.prototype.findSong = function(at) {
    return _.find(this.songs, function(song) {
        return song.uuid === at;
    });
};

/**
 * Returns currently playing song
 * @returns {Song|undefined} - Song object, undefined if no now playing song
 */
Queue.prototype.getNowPlaying = function() {
    return this.songs[this.curQueuePos];
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
 * @param {String} at - Insert songs after song with this UUID
 *                      (-1 = start of queue)
 * @param {Object[]} songs - List of songs to insert
 * @return {Error} - in case of errors
 */
Queue.prototype.insertSongs = function(at, songs) {
    var pos;
    if (at === '-1') {
        // insert at start of queue
        pos = 0;
    } else {
        // insert song after song with UUID
        pos = this.findSongPos(at);

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

    // sync queue & player state with changes
    if (this.curQueuePos === -1) {
        // queue was empty, start playing first song
        this.curQueuePos++;
        this.callHooks('queueModified');
    } else if (pos <= this.curQueuePos) {
        // songs inserted before curQueuePos, increment it
        this.curQueuePos += songs.length;
    } else if (pos === this.curQueuePos + 1) {
        // new next song, prepare it
        this.callHooks('queueModified');
    }
};

/**
 * Removes songs from queue
 * @param {String} at - Start removing at song with this UUID
 * @param {Number} cnt - Number of songs to delete
 * @return {Song[] | Error} - List of removed songs, Error in case of errors
 */
Queue.prototype.removeSongs = function(at, cnt) {
    var pos = this.findSongPos(at);
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

    var removed = this.songs.splice(pos, cnt);

    if (pos <= this.curQueuePos) {
        if (pos + cnt >= this.curQueuePos) {
            // removed now playing, change to first song after splice
            this.curQueuePos = pos;
            this.callHooks('queueModified');
        } else {
            // removed songs before now playing, update queue pos
            this.curQueuePos -= cnt;
        }
    } else if (pos === this.curQueuePos + 1) {
        // new next song, make sure it's prepared
        this.callHooks('queueModified');
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

        this.unshuffledSongs = undefined;
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

    this.callHooks('queueModified');
};

module.exports = Queue;
