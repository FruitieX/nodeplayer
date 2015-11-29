'use strict';
var _ = require('underscore');
var async = require('async');
var labeledLogger = require('./logger');
var Queue = require('./queue');

function Player(options) {
    options = options || {};

    // TODO: some of these should NOT be loaded from config
    _.bindAll.apply(_, [this].concat(_.functions(this)));
    this.config         = options.config            || require('./config').getConfig();
    this.logger         = options.logger            || labeledLogger('core');
    this.queue          = options.queue             || new Queue(this);
    this.nowPlaying     = options.nowPlaying        || null;
    this.play           = options.play              || false;
    this.repeat         = options.repeat            || false;
    this.plugins        = options.plugins           || {};
    this.backends       = options.backends          || {};
    this.songsPreparing = options.songsPreparing    || {};
    this.volume         = options.volume            || 1;
    this.songEndTimeout = options.songEndTimeout    || null;
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

/**
 * Returns currently playing song
 * @returns {Song|null} - Song object, null if no now playing song
 */
Player.prototype.getNowPlaying = function() {
    return this.nowPlaying ? this.queue.findSong(this.nowPlaying.uuid) : null;
};

// TODO: handling of pause in a good way?
/**
 * Stop playback of current song
 * @param {Boolean} [pause=false] - If true, don't reset song position
 */
Player.prototype.stopPlayback = function(pause) {
    this.logger.info('playback ' + (pause ? 'paused.' : 'stopped.'));
    this.play = false;

    var np = this.nowPlaying;
    if (np) {
        np.playback = {
            startTime: 0,
            startPos: pause ? np.startPos + (new Date().getTime() - np.startTime) : 0
        };
    }
};

/**
 * Start playing now playing song, at optional position
 * @param {Number} [position=0] - Position at which playback is started
 */
Player.prototype.startPlayback = function(position) {
    position = position || 0;

    if (!this.nowPlaying) {
        // find first song in queue
        this.nowPlaying = this.queue.songs[0];

        if (!this.nowPlaying) {
            return this.logger.error('queue is empty! not starting playback.');
        }
    }

    this.nowPlaying.prepare(function(err) {
        if (err) {
            return this.logger.error('error while preparing now playing: ' + err);
        }

        this.nowPlaying.playback = {
            startTime: new Date(),
            startPos: position
        };

        this.logger.info('playback started.');
        this.play = true;
    });
};

/**
 * Change to song
 * @param {String} uuid - UUID of song to change to, if not found in queue, now
 *                        playing is removed, playback stopped
 */
Player.prototype.changeSong = function(uuid) {
    this.logger.verbose('changing song to: ' + uuid);
    clearTimeout(this.songEndTimeout);

    this.nowPlaying = this.queue.findSong(uuid);

    if (!this.nowPlaying) {
        this.logger.info('song not found: ' + uuid);
        this.stopPlayback();
    }

    this.startPlayback();
    this.logger.info('changed song to: ' + uuid);
};

Player.prototype.songEnd = function() {
    var np = this.queue.getNowPlaying();
    var npIndex = np ? this.queue.findSongIndex(np.uuid) : -1;

    this.logger.info('end of song ' + np.uuid);
    this.callHooks('onSongEnd', [np]);

    var nextSong = this.queue.songs[npIndex + 1];
    if (!nextSong) {
        this.logger.info('hit end of queue.');

        if (this.repeat) {
            this.logger.info('repeat is on, restarting playback from start of queue.');
            this.changeSong(this.queue.uuidAtIndex(0));
        }
    } else {
        this.changeSong(nextSong.uuid);
    }

    this.prepareSongs();
};

// start or resume playback of now playing song.
// if pos is undefined, playback continues (or starts from 0 if !playbackPosition)
Player.prototype.startPlayback = function(pos) {
    var player = this;

    var np = this.queue.getNowPlaying();

    if (!np) {
        this.logger.verbose('startPlayback called, but no song at curPlaylistPos');
        return;
    }

    if (!_.isUndefined(pos) && !_.isNull(pos)) {
        this.logger.info('playing song: ' + np.songID + ', from pos: ' + pos);
    } else {
        this.logger.info('playing song: ' + np.songID);
    }

    var oldPlaybackStart = this.queue.playbackStart;
    this.queue.playbackStart = new Date().getTime(); // song is playing while this is truthy

    // where did the song start playing from at playbackStart?
    if (!_.isUndefined(pos) && !_.isNull(pos)) {
        this.queue.playbackPosition = pos;
    } else if (!this.queue.playbackPosition) {
        this.queue.playbackPosition = 0;
    }

    if (oldPlaybackStart) {
        this.callHooks('onSongSeek', [np]);
    } else {
        this.callHooks('onSongChange', [np]);
    }

    var durationLeft = parseInt(np.duration) -
        this.queue.playbackPosition + this.config.songDelayMs;

    if (this.songEndTimeout) {
        this.logger.debug('songEndTimeout was cleared');
        clearTimeout(this.songEndTimeout);
        this.songEndTimeout = null;
    }
    this.songEndTimeout = setTimeout(this.queue.endOfSong, durationLeft);
};

Player.prototype.pausePlayback = function() {
    var player = this;

    // update position
    player.queue.playbackPosition += new Date().getTime() - player.queue.playbackStart;
    player.queue.playbackStart = null;

    clearTimeout(player.songEndTimeout);
    player.songEndTimeout = null;
    player.callHooks('onSongPause', [player.queue.getNowPlaying()]);
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
    }, this.config.songPrepareTimeout);

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
    if (this.queue.getNowPlaying() &&
            this.queue.getNowPlaying().uuid === song.uuid &&
            !this.queue.playbackStart && newData) {
        this.startPlayback();
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
    if (!song) {
        return callback(new Error('prepareSong() without song'));
    }
    if (!this.backends[song.backendName]) {
        return callback(new Error('prepareSong() without unknown backend: ' + song.backendName));
    }

    if (this.backends[song.backendName].isPrepared(song)) {
        // start playback if it hasn't been started yet
        // TODO: not if paused
        if (this.queue.getNowPlaying() &&
                this.queue.getNowPlaying().uuid === song.uuid &&
                !this.queue.playbackStart) {
            this.startPlayback();
        }

        // song is already prepared, ok to prepare more songs
        callback();
    } else if (this.songsPreparing[song.backendName][song.songID]) {
        // this song is still preparing, so don't yet prepare next song
        callback(true);
    } else {
        // song is not prepared and not currently preparing: let backend prepare it
        this.logger.debug('DEBUG: prepareSong() ' + song.songID);
        this.songsPreparing[song.backendName][song.songID] = song;

        song.cancelPrepare = this.backends[song.backendName].prepareSong(
            song,
            _.partial(this.prepareProgCallback, _, _, _, callback),
            _.partial(this.prepareErrCallback, _, _, callback)
        );

        this.setPrepareTimeout(song);
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
            var song = player.queue.getNowPlaying();
            if (song) {
                player.prepareSong(song, callback);
            } else {
                // bail out
                callback(true);
            }
        },
        function(callback) {
            // prepare next song in playlist
            var np = player.queue.getNowPlaying();
            var song = player.queue.songs[player.queue.findSongIndex(np) + 1];
            if (song) {
                player.prepareSong(song, callback);
            } else {
                // bail out
                callback(true);
            }
        }
    ]);
};

Player.prototype.getPlaylists = function(callback) {
    var resultCnt = 0;
    var allResults = {};
    var player = this;

    _.each(this.backends, function(backend) {
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

/*
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
*/

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

// cnt can be negative to go back or zero to restart current song
Player.prototype.skipSongs = function(cnt) {
    var player = this;

    this.queue.curQueuePos = Math.min(this.queue.length, this.queue.curQueuePos + cnt);

    this.queue.playbackPosition = null;
    this.queue.playbackStart = null;
    clearTimeout(this.songEndTimeout);
    this.songEndTimeout = null;
    this.prepareSongs();
};

// TODO: userID does not belong into core...?
Player.prototype.setVolume = function(newVol, userID) {
    newVol = Math.min(1, Math.max(0, newVol));
    this.volume = newVol;
    this.callHooks('onVolumeChange', [newVol, userID]);
};

module.exports = Player;
