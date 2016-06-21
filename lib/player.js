'use strict';
var _ = require('underscore');
var async = require('async');
var labeledLogger = require('./logger');
var Queue = require('./queue');
var modules = require('./modules');

function Player(options) {
    options = options || {};

    // TODO: some of these should NOT be loaded from config
    _.bindAll.apply(_, [this].concat(_.functions(this)));
    this.config          = options.config            || require('./config').getConfig();
    this.logger          = options.logger            || labeledLogger('core');
    this.queue           = options.queue             || new Queue(this);
    this.nowPlaying      = options.nowPlaying        || null;
    this.play            = options.play              || false;
    this.repeat          = options.repeat            || false;
    this.plugins         = options.plugins           || {};
    this.backends        = options.backends          || {};
    this.prepareTimeouts = options.prepareTimeouts   || {};
    this.volume          = options.volume            || 1;
    this.songEndTimeout  = options.songEndTimeout    || null;
    this.pluginVars      = options.pluginVars        || {};

    var player = this;
    var config = player.config;
    var forceUpdate = false;

    // initialize plugins & backends
    async.series([
        function(callback) {
            modules.loadBuiltinPlugins(player, function(plugins) {
                player.plugins = plugins;
                player.callHooks('onBuiltinPluginsInitialized');
                callback();
            });
        }, function(callback) {
            modules.loadPlugins(player, config.plugins, forceUpdate,
            function(results) {
                player.plugins = _.extend(player.plugins, results);
                player.callHooks('onPluginsInitialized');
                callback();
            });
        }, function(callback) {
            modules.loadBuiltinBackends(player, function(backends) {
                player.backends = backends;
                player.callHooks('onBuiltinBackendsInitialized');
                callback();
            });
        }, function(callback) {
            modules.loadBackends(player, config.backends, forceUpdate, function(results) {
                player.backends = _.extend(player.backends, results);
                player.callHooks('onBackendsInitialized');
                callback();
            });
        }
    ], function() {
        player.logger.info('ready');
        player.callHooks('onReady');
    });
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
    return this.nowPlaying;
};

// TODO: handling of pause in a good way?
/**
 * Stop playback of current song
 * @param {Boolean} [pause=false] - If true, don't reset song position
 */
Player.prototype.stopPlayback = function(pause) {
    this.logger.info('playback ' + (pause ? 'paused.' : 'stopped.'));

    clearTimeout(this.songEndTimeout);
    this.play = false;

    var np = this.nowPlaying;
    var pos = np.playback.startPos + (new Date().getTime() - np.playback.startTime);
    if (np) {
        np.playback = {
            startTime: 0,
            startPos: pause ? pos : 0
        };
    }
};

/**
 * Start playing now playing song, at optional position
 * @param {Number} [position=0] - Position at which playback is started
 */
Player.prototype.startPlayback = function(position) {
    position = position || 0;
    var player = this;

    if (!this.nowPlaying) {
        // find first song in queue
        this.nowPlaying = this.queue.songs[0];

        if (!this.nowPlaying) {
            return this.logger.error('queue is empty! not starting playback.');
        }
    }

    this.nowPlaying.prepare(function(err) {
        if (err) {
            return player.logger.error('error while preparing now playing: ' + err);
        }

        player.nowPlaying.playbackStarted(position || player.nowPlaying.playback.startPos);

        player.logger.info('playback started.');
        player.play = true;
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
    var np = this.getNowPlaying();
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

// TODO: proper song object with constructor?
Player.prototype.setPrepareTimeout = function(song) {
    var player = this;

    if (song.prepareTimeout) {
        clearTimeout(song.prepareTimeout);
    }

    song.prepareTimeout = setTimeout(function() {
        player.logger.info('prepare timeout for song: ' + song.songId + ', removing');
        song.cancelPrepare('prepare timeout');
        song.prepareTimeout = null;
    }, this.config.songPrepareTimeout);

    Object.defineProperty(song, 'prepareTimeout', {
        enumerable: false,
        writable: true
    });
};

Player.prototype.prepareError = function(song, err) {
    // TODO: mark song as failed
    this.callHooks('onSongPrepareError', [song, err]);
};

Player.prototype.prepareProgCallback = function(song, newData, done) {
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
    if (this.play && this.getNowPlaying() &&
            this.getNowPlaying().uuid === song.uuid &&
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
        this.songsPreparing[song.backend.name][song.songId].songData = undefined;
        delete(this.songsPreparing[song.backend.name][song.songId]);

        // clear prepare timeout
        clearTimeout(song.prepareTimeout);
        song.prepareTimeout = null;
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
    delete(this.songsPreparing[song.backend.name][song.songId]);
};

Player.prototype.prepareSong = function(song, callback) {
    var self = this;

    if (!song) {
        throw new Error('prepareSong() without song');
    }

    if (song.isPrepared()) {
        // start playback if it hasn't been started yet
        if (this.play && this.getNowPlaying() &&
                this.getNowPlaying().uuid === song.uuid &&
                !this.queue.playbackStart) {
            this.startPlayback();
        }

        // song is already prepared, ok to prepare more songs
        callback();
    } else {
        // song is not prepared and not currently preparing: let backend prepare it
        this.logger.debug('DEBUG: prepareSong() ' + song.songId);

        song.prepare(function(err, chunk, done) {
            if (err) {
                return callback(err);
            }

            if (chunk) {
                self.prepareProgCallback(song, chunk, done);
            }

            if (done) {
                callback();
            }
        });

        this.setPrepareTimeout(song);
    }
};

/**
 * Prepare now playing and next song for playback
 */
Player.prototype.prepareSongs = function() {
    var player = this;

    var currentSong;
    async.series([
        function(callback) {
            // prepare now-playing song
            currentSong = player.getNowPlaying();
            if (currentSong) {
                player.prepareSong(currentSong, callback);
            } else if (player.queue.getLength()) {
                // songs exist in queue, prepare first one
                currentSong = player.queue.songs[0];
                player.prepareSong(currentSong, callback);
            } else {
                // bail out
                callback(true);
            }
        },
        function(callback) {

            // prepare next song in playlist
            var nextSong = player.queue.songs[player.queue.findSongIndex(currentSong) + 1];
            if (nextSong) {
                player.prepareSong(nextSong, callback);
            } else {
                // bail out
                callback(true);
            }
        }
    ]);
    // TODO where to put this
    player.prepareErrCallback();
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
                    allResults[backend.name].songs[song.songId] = song;
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

// TODO: userID does not belong into core...?
Player.prototype.setVolume = function(newVol, userID) {
    newVol = Math.min(1, Math.max(0, newVol));
    this.volume = newVol;
    this.callHooks('onVolumeChange', [newVol, userID]);
};

module.exports = Player;
