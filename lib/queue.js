var _ = require('underscore');

function Queue(modifyCallback) {
    if (!modifyCallback) {
        return new Error('Queue constructor called without a modifyCallback!');
    }

    this.songs = [];
    this.curQueuePos = -1;
    this.playbackStart = -1;
    this.playbackPosition = -1;
    this.modifyCallback = modifyCallback;
}

/**
 * Find index of song in queue
 * @param {String} at - Look for song with this UUID
 */
Queue.prototype.findSongIndex = function(at) {
    return _.findIndex(this.songs, function(song) {
        return song.uuid === at;
    });
};

/**
 * Find song in queue
 * @param {String} at - Look for song with this UUID
 */
Queue.prototype.findSong = function(at) {
    return _.find(this.songs, function(song) {
        return song.uuid === at;
    });
};

/**
 * Returns currently playing song
 */
Queue.prototype.getNowPlaying = function() {
    return this.songs[this.curQueuePos];
};

/**
 * Insert songs into queue
 * @param {String} at - Insert songs after song with this UUID
 *                      (-1 = start of queue)
 * @param {Object[]} songs - List of songs to insert
 */
Queue.prototype.insertSongs = function(at, songs, callback) {
    var player = this;

    var pos;
    if (at === '-1') {
        // insert at start of queue
        pos = 0;
    } else {
        // insert song after song with UUID
        pos = player.findSongPos(at);

        if (pos < 0) {
            return callback(new Error('Song with UUID ' + at + ' not found!'));
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

    // sync player state with changes
    if (player.curQueuePos === -1) {
        // queue was empty, start playing first song
        player.curQueuePos++;
        player.prepareSongs();
    } else if (pos <= player.curQueuePos) {
        // songs inserted before curQueuePos, increment it
        player.curQueuePos += songs.length;
    } else if (pos === player.curQueuePos + 1) {
        // new next song, prepare it
        player.prepareSongs();
    }

    callback();
};

/**
 * Removes songs from queue
 * @param {String} at - Start removing at song with this UUID
 * @param {Number} cnt - Number of songs to delete
 */
Queue.prototype.removeSongs = function(at, cnt, callback) {
    var player = this;

    var pos = player.findSongPos(at);
    if (pos < 0) {
        return callback(new Error('Song with UUID ' + at + ' not found!'));
    }

    // cancel preparing all songs to be deleted
    for (var i = pos; i < pos + cnt && i < this.songs.length; i++) {
        var song = this.songs[i];
        if (song.cancelPrepare) {
            song.cancelPrepare('Song removed.');
        }
    }

    this.songs.splice(pos, cnt);

    if (pos <= player.curQueuePos) {
        if (pos + cnt >= player.curQueuePos) {
            // removed now playing, change to first song after splice
            player.curQueuePos = pos;
            player.prepareSongs();
        } else {
            // removed songs before now playing, update queue pos
            player.curQueuePos -= cnt;
        }
    } else if (pos === player.curQueuePos + 1) {
        // new next song, make sure it's prepared
        player.prepareSongs();
    }

    callback();
};

