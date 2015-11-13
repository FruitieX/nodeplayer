'use strict';
var _ = require('underscore');
var async = require('async');
var labeledLogger = require('./logger');
var uuid = require('node-uuid');

function Player(options) {
    options = options || {};

    // TODO: some of these should NOT be loaded from config
    _.bindAll.apply(_, [this].concat(_.functions(this)));
    this.config         = options.config            || require('./config').getConfig();
    this.logger         = options.logger            || labeledLogger('core');
    this.playlist       = options.playlist          || [];
    this.curPlaylistPos = options.curPlaylistPos    || 0;
    this.plugins        = options.plugins           || {};
    this.backends       = options.backends          || {};
    this.songsPreparing = options.songsPreparing    || {};
    this.volume         = options.volume            || 1;
    this.songEndTimeout = options.songEndTimeout    || null;
    this.playbackState  = {
        // TODO: move playbackStart, playbackPosition etc here
    };
}

// call hook function in all modules
// if any hooks return a truthy value, it is an error and we abort
// be very careful with calling hooks from within a hook, infinite loops are possible
Player.prototype.callHooks = function(hook, argv) {
    // _.find() used instead of _.each() because we want to break out as soon
    // as a hook returns a truthy value (used to indicate an error, e.g. in form
    // of a string)
    var err = null;

    this.logger.silly('callHooks(' + hook +
        (argv ?  ', ' + JSON.stringify(argv) + ')' : ')'));

    _.find(this.plugins, function(plugin) {
        if (plugin[hook]) {
            err = plugin[hook].apply(null, argv);
            return err;
        }
    });

    return err;
};

// returns number of hook functions attached to given hook
Player.prototype.numHooks = function(hook) {
    var cnt = 0;

    _.find(this.plugins, function(plugin) {
        if (plugin[hook]) {
            cnt++;
        }
    });

    return cnt;
};

Player.prototype.endOfSong = function() {
    //var np = this.queue[0];
    var player = this;

    player.curPlaylistPos++;

    player.logger.info('end of song ' + np.songID);
    player.callHooks('onSongEnd', [np]);

    player.playbackPosition = null;
    player.playbackStart = null;
    player.songEndTimeout = null;
    player.prepareSongs();
};

// start or resume playback of now playing song.
// if pos is undefined, playback continues (or starts from 0 if !playbackPosition)
Player.prototype.startPlayback = function(pos) {
    var player = this;
    var np = player.getNowPlaying();

    if (!np) {
        player.logger.verbose('startPlayback called, but hit end of queue');
        return;
    }

    if (!_.isUndefined(pos) && !_.isNull(pos)) {
        player.logger.info('playing song: ' + np.songID + ', from pos: ' + pos);
    } else {
        player.logger.info('playing song: ' + np.songID);
    }

    var oldPlaybackStart = player.playbackStart;
    player.playbackStart = new Date().getTime(); // song is playing while this is truthy

    // where did the song start playing from at playbackStart?
    if (!_.isUndefined(pos) && !_.isNull(pos)) {
        player.playbackPosition = pos;
    } else if (!player.playbackPosition) {
        player.playbackPosition = 0;
    }

    if (oldPlaybackStart) {
        player.callHooks('onSongSeek', [np]);
    } else {
        player.callHooks('onSongChange', [np]);
    }

    var durationLeft = parseInt(np.duration) - player.playbackPosition + player.config.songDelayMs;
    if (player.songEndTimeout) {
        player.logger.debug('songEndTimeout was cleared');
        clearTimeout(player.songEndTimeout);
        player.songEndTimeout = null;
    }
    player.songEndTimeout = setTimeout(player.endOfSong, durationLeft);
};

Player.prototype.pausePlayback = function() {
    var player = this;

    // update position
    player.playbackPosition += new Date().getTime() - player.playbackStart;
    player.playbackStart = null;

    clearTimeout(player.songEndTimeout);
    player.songEndTimeout = null;
    player.callHooks('onSongPause', [player.nowPlaying]);
};

// TODO: proper song object with constructor?
Player.prototype.setPrepareTimeout = function(song) {
    var player = this;

    if (song.prepareTimeout) {
        clearTimeout(song.prepareTimeout);
    }

    song.prepareTimeout = setTimeout(function() {
        player.logger.info('prepare timeout for song: ' + song.songID + ', removing');
        song.cancelPrepare('prepare timeout');
        song.prepareTimeout = null;
    }, player.config.songPrepareTimeout);

    Object.defineProperty(song, 'prepareTimeout', {
        enumerable: false,
        writable: true
    });
};

Player.prototype.prepareError = function(song, err) {
    // remove all instances of this song
    /*
    for (var i = this.queue.length - 1; i >= 0; i--) {
        if (this.queue[i].songID === song.songID &&
            this.queue[i].backendName === song.backendName) {
            if (!song.beingDeleted) {
                this.logger.error('preparing song failed! (' + err + '), removing from queue: ' +
                        song.songID);
                this.removeFromQueue(i);
            }
        }
    }
    */

    this.callHooks('onSongPrepareError', [song, err]);
};

Player.prototype.prepareProgCallback = function(song, newData, done, callback) {
    /* progress callback
     * when this is called, new song data has been flushed to disk */

    // append new song data to buffer
    Object.defineProperty(song, 'songData', {
        enumerable: false,
        writable: true
    });
    if (newData) {
        song.songData = song.songData ? Buffer.concat([song.songData, newData]) : newData;
    } else if (!song.songData) {
        song.songData = new Buffer(0);
    }

    // start playback if it hasn't been started yet
    // TODO: not if paused
    if (player.getNowPlaying() &&
            player.getNowPlaying().uuid === song.uuid &&
            !player.playbackStart && newData) {
        player.startPlayback();
    }

    // tell plugins that new data is available for this song, and
    // whether the song is now fully written to disk or not.
    this.callHooks('onPrepareProgress', [song, newData, done]);

    if (done) {
        // mark song as prepared
        this.callHooks('onSongPrepared', [song]);

        // done preparing, can't cancel anymore
        delete(song.cancelPrepare);

        // song data should now be available on disk, don't keep it in memory
        this.songsPreparing[song.backendName][song.songID].songData = undefined;
        delete(this.songsPreparing[song.backendName][song.songID]);

        // clear prepare timeout
        clearTimeout(song.prepareTimeout);
        song.prepareTimeout = null;

        callback();
    } else {
        // reset prepare timeout
        this.setPrepareTimeout(song);
    }
};

Player.prototype.prepareErrCallback = function(song, err, callback) {
    /* error callback */

    // don't let anything run cancelPrepare anymore
    delete(song.cancelPrepare);

    // clear prepare timeout
    clearTimeout(song.prepareTimeout);
    song.prepareTimeout = null;

    // abort preparing more songs; current song will be deleted ->
    // onQueueModified is called -> song preparation is triggered again
    callback(true);

    // TODO: investigate this, should probably be above callback
    this.prepareError(song, err);

    song.songData = undefined;
    delete(this.songsPreparing[song.backendName][song.songID]);
};

Player.prototype.prepareSong = function(song, callback) {
    var player = this;

    if (!song) {
        return callback(new Error('prepareSong() without song'));
    }
    if (!player.backends[song.backendName]) {
        return callback(new Error('prepareSong() without unknown backend: ' + song.backendName));
    }

    if (player.backends[song.backendName].isPrepared(song)) {
        // start playback if it hasn't been started yet
        // TODO: not if paused
        if (player.getNowPlaying() &&
                player.getNowPlaying().uuid === song.uuid &&
                !player.playbackStart) {
            player.startPlayback();
        }

        // song is already prepared, ok to prepare more songs
        callback();
    } else if (player.songsPreparing[song.backendName][song.songID]) {
        // this song is still preparing, so don't yet prepare next song
        callback(true);
    } else {
        // song is not prepared and not currently preparing: let backend prepare it
        player.logger.debug('DEBUG: prepareSong() ' + song.songID);
        player.songsPreparing[song.backendName][song.songID] = song;

        song.cancelPrepare = player.backends[song.backendName].prepareSong(
            song,
            _.partial(player.prepareProgCallback, _, _, _, callback),
            _.partial(player.prepareErrCallback, _, _, callback)
        );

        player.setPrepareTimeout(song);
    }
};

/**
 * Prepare now playing and next song for playback
 */
Player.prototype.prepareSongs = function() {
    var player = this;

    async.series([
        function(callback) {
            // prepare now-playing song
            var song = player.playlist[player.curPlaylistPos];
            if (song) {
                player.prepareSong(song, callback);
            } else {
                // bail out
                callback(true);
            }
        },
        function(callback) {
            // prepare next song in playlist
            var song = player.playlist[player.curPlaylistPos + 1];
            if (song) {
                player.prepareSong(song, callback);
            } else {
                // bail out
                callback(true);
            }
        }
    ]);
};

/**
 * Find index of song in playlist
 * @param {String} at - Look for song with this UUID
 */
Player.prototype.findSongIndex = function(at) {
    return _.findIndex(player.playlist, function(song) {
        return song.uuid === at;
    });
};

/**
 * Find song in playlist
 * @param {String} at - Look for song with this UUID
 */
Player.prototype.findSong = function(at) {
    return _.find(player.playlist, function(song) {
        return song.uuid === at;
    });
};

/**
 * Returns currently playing song
 */
Player.prototype.getNowPlaying = function() {
    return this.playlist[this.curPlaylistPos];
};

/**
 * Insert songs into queue or playlist
 * @param {String} at - Insert songs after song with this UUID
 *                      (-1 = start of playlist)
 * @param {Object[]} songs - List of songs to insert
 */
Player.prototype.insertSongs = function(at, songs, callback) {
    var player = this;

    var pos;
    if (at === -1) {
        // insert at start of playlist
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
    Array.prototype.splice.apply(player.playlist, args);

    // sync player state with changes
    if (pos <= player.curPlaylistPos) {
        // songs inserted before curPlaylistPos, increment it
        player.curPlaylistPos += songs.length;
    } else if (pos === player.curPlaylistPos + 1) {
        // new next song, prepare it
        prepareSongs();
    }

    callback();
};

/**
 * Removes songs from queue or playlist
 * @param {String} at - Start removing at song with this UUID
 * @param {Number} cnt - Number of songs to delete
 */
Player.prototype.removeSongs = function(at, cnt, callback) {
    var player = this;

    var pos = player.findSongPos(at);
    if (pos < 0) {
        return callback(new Error('Song with UUID ' + at + ' not found!'));
    }

    // cancel preparing all songs to be deleted
    for (var i = pos; i < pos + cnt && i < player.playlist.length; i++) {
        var song = player.playlist[i];
        if (song.cancelPrepare) {
            song.cancelPrepare('Song removed.');
        }
    }

    player.playlist.splice(pos, cnt);

    if (pos <= player.curPlaylistPos) {
        if (pos + cnt >= player.curPlaylistPos) {
            // removed now playing, change to first song after splice
            player.curPlaylistPos = pos;
            prepareSongs();
        } else {
            // removed songs before now playing, update playlist pos
            player.curPlaylistPos -= cnt;
        }
    } else if (pos === player.curPlaylistPos + 1) {
        // new next song, make sure it's prepared
        prepareSongs();
    }

    callback();
};

Player.prototype.getPlaylists = function(callback) {
    var resultCnt = 0;
    var allResults = {};
    var player = this;

    _.each(player.backends, function(backend) {
        if (!backend.getPlaylists) {
            resultCnt++;

            // got results from all services?
            if (resultCnt >= Object.keys(player.backends).length) {
                callback(allResults);
            }
            return;
        }

        backend.getPlaylists(function(err, results) {
            resultCnt++;

            allResults[backend.name] = results;

            // got results from all services?
            if (resultCnt >= Object.keys(player.backends).length) {
                callback(allResults);
            }
        });
    });
};

Player.prototype.replacePlaylist = function(backendName, playlistId, callback) {
    var player = this;

    if (backendName === 'core') {
        fs.readFile(path.join(config.getBaseDir(), 'playlists', playlistId + '.json'),
        function(err, playlist) {
            if (err) {
                return callback(new Error('Error while fetching playlist' + err));
            }

            playlist = JSON.parse(playlist);

            // reset playlist position
            player.playlistPos = 0;
            player.playlist = playlist;
        });

        return;
    }

    var backend = this.backends[backendName];

    if (!backend) {
        return callback(new Error('Unknown backend ' + backendName));
    }

    if (!backend.getPlaylist) {
        return callback(new Error('Backend ' + backendName + ' does not support playlists'));
    }

    backend.getPlaylist(playlistId, function(err, playlist) {
        if (err) {
            return callback(new Error('Error while fetching playlist' + err));
        }

        // reset playlist position
        player.playlistPos = 0;
        player.playlist = playlist;
    });
};

// make a search query to backends
Player.prototype.searchBackends = function(query, callback) {
    var resultCnt = 0;
    var allResults = {};

    _.each(this.backends, function(backend) {
        backend.search(query, _.bind(function(results) {
            resultCnt++;

            // make a temporary copy of songlist, clear songlist, check
            // each song and add them again if they are ok
            var tempSongs = _.clone(results.songs);
            allResults[backend.name] = results;
            allResults[backend.name].songs = {};

            _.each(tempSongs, function(song) {
                var err = this.callHooks('preAddSearchResult', [song]);
                if (!err) {
                    allResults[backend.name].songs[song.songID] = song;
                } else {
                    this.logger.error('preAddSearchResult hook error: ' + err);
                }
            }, this);

            // got results from all services?
            if (resultCnt >= Object.keys(this.backends).length) {
                callback(allResults);
            }
        }, this), _.bind(function(err) {
            resultCnt++;
            this.logger.error('error while searching ' + backend.name + ': ' + err);

            // got results from all services?
            if (resultCnt >= Object.keys(this.backends).length) {
                callback(allResults);
            }
        }, this));
    }, this);
};

// get rid of song in queue
// cnt can be left out for deleting only one song
Player.prototype.removeFromQueue = function(pos, cnt, onlyRemove) {
    var retval = [];
    if (!cnt) {
        cnt = 1;
    }
    pos = Math.max(0, parseInt(pos));

    if (!onlyRemove) {
        this.callHooks('preSongsRemoved', [pos, cnt]);
    }

    // remove songs from queue
    if (pos + cnt > 0) {
        if (this.queue.length) {
            // stop preparing songs we are about to remove
            // we want to limit this to this.queue.length if cnt is very large
            for (var i = 0; i < Math.min(this.queue.length, pos + cnt); i++) {
                var song = this.queue[i];

                // signal prepareError function not to run removeFromQueue again
                // TODO: try getting rid of this ugly hack (beingDeleted)...
                // TODO: more non enumerable properties, especially plugins?
                /*
                Object.defineProperty(song, 'beingDeleted', {
                    enumerable: false,
                    writable: true
                });
                */

                song.beingDeleted = true;
                if (song.cancelPrepare) {
                    song.cancelPrepare('song deleted');
                    delete(song.cancelPrepare);
                }
            }

            retval = this.queue.splice(pos, cnt);

            if (pos === 0) {
                // now playing was deleted
                this.playbackPosition = null;
                this.playbackStart = null;
                clearTimeout(this.songEndTimeout);
                this.songEndTimeout = null;
            }
        }
    }

    if (!onlyRemove) {
        this.refreshPlaylist();
        this.callHooks('postSongsRemoved', [pos, cnt]);
    }

    return retval;
};

Player.prototype.moveInQueue = function(from, to, cnt) {
    if (!cnt || cnt < 1) {
        cnt = 1;
    }
    if (from < 0 || from + cnt > this.queue.length || to + cnt > this.queue.length) {
        return null;
    }

    this.callHooks('preSongsMoved', [from, to, cnt]);

    var songs = this.removeFromQueue(from, cnt, true);
    Array.prototype.splice.apply(this.queue, [to, 0].concat(songs));

    this.callHooks('sortQueue');
    this.refreshPlaylist();
    this.callHooks('postSongsMoved', [songs, from, to, cnt]);

    return songs;
};

// add songs to the queue, at optional position
Player.prototype.addToQueue = function(songs, pos) {
    if (!pos) {
        pos = this.queue.length;
    }
    if (pos < 0) {
        pos = 1;
    }
    pos = Math.min(pos, this.queue.length);

    this.callHooks('preSongsQueued', [songs, pos]);
    _.each(songs, function(song) {
        // check that required fields are provided
        if (!song.title || !song.songID || !song.backendName || !song.duration) {
            this.logger.info('required song fields not provided: ' + song.songID);
            return;
            //return 'required song fields not provided'; // TODO: this ain't gonna work
        }

        var err = this.callHooks('preSongQueued', [song]);
        if (err) {
            this.logger.error('not adding song to queue: ' + err);
        } else {
            song.timeAdded = new Date().getTime();

            this.queue.splice(pos++, 0, song);
            this.logger.info('added song to queue: ' + song.songID);
            this.callHooks('postSongQueued', [song]);
        }
    }, this);

    this.callHooks('sortQueue');
    this.refreshPlaylist();
    this.callHooks('postSongsQueued', [songs, pos]);
};

// TODO: this can't be undone :(
Player.prototype.shuffleQueue = function() {
    // don't change now playing
    var temp = this.playlist.shift();
    this.playlist = _.shuffle(this.playlist);
    this.playlist.unshift(temp);

    this.callHooks('onQueueShuffled', [this.playlist]);
    this.refreshPlaylist();
};

// cnt can be negative to go back or zero to restart current song
Player.prototype.skipSongs = function(cnt) {
    var player = this;

    player.curPlaylistPos = Math.min(player.playlist.length, player.curPlaylistPos + cnt);

    player.playbackPosition = null;
    player.playbackStart = null;
    clearTimeout(player.songEndTimeout);
    player.songEndTimeout = null;
    player.prepareSongs();
};

// TODO: userID does not belong into core...?
Player.prototype.setVolume = function(newVol, userID) {
    var player = this;

    newVol = Math.min(1, Math.max(0, newVol));
    player.volume = newVol;
    player.callHooks('onVolumeChange', [newVol, userID]);
};

module.exports = Player;
