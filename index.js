var _ = require('underscore');

var userConfig = require(process.env.HOME + '/.partyplayConfig.js');
var defaultConfig = require(__dirname + '/partyplayConfigDefaults.js');
var config = _.defaults(userConfig, defaultConfig);

var player = {
    config: config,
    queue: [],
    nowPlaying: null,
    plugins: {},
    backends: {}
}

// call hook function in all modules
// if any hooks return a truthy value, it is an error and we abort
// be very careful with calling hooks from within a hook, infinite loops are possible
var callHooks = function(hook, argv) {
    // _.find() used instead of _.each() because we want to break out as soon
    // as a hook returns a truthy value (used to indicate an error, e.g. in form
    // of a string)
    return _.find(player.plugins, function(plugin) {
        if(plugin[hook]) {
            return plugin[hook].apply(null, argv);
        }
    });
};
player.callHooks = callHooks;

// returns number of hook functions attached to given hook
var numHooks = function(hook) {
    var cnt = 0;

    _.find(player.plugins, function(plugin) {
        if(plugin[hook]) {
            cnt++;
        }
    });

    return cnt;
};
player.numHooks = numHooks;

// to be called whenever the queue has been modified
// this function will:
// - play back the first song in the queue if no song is playing
// - prepare first and second songs in the queue
var onQueueModify = function() {
    if(!player.queue.length) {
        callHooks('onEndOfQueue', [player]);
        console.log('end of queue, waiting for more songs');
        return;
    }

    var startPlayingNext = false;
    if(!player.nowPlaying) {
        // play song
        player.nowPlaying = player.queue.shift();
        startPlayingNext = true;
    }

    // TODO: error handling if backends[...] is undefined
    // prepare now playing song
    player.backends[player.nowPlaying.backendName].prepareSong(player.nowPlaying.songID, function() {
        callHooks('onSongPrepared', [player]);

        if(startPlayingNext) {
            console.log('playing song: ' + player.nowPlaying.songID);

            player.nowPlaying.playbackStart = new Date();

            callHooks('onSongChange', [player]);

            var songTimeout = parseInt(player.nowPlaying.duration) + config.songDelayMs;
            setTimeout(function() {
                console.log('end of song ' + player.nowPlaying.songID);
                callHooks('onSongEnd', [player]);

                player.nowPlaying = null;
                onQueueModify();
            }, songTimeout);
        }

        // TODO: support pre-caching multiple songs at once if configured so
        // prepare next song(s) in queue
        if(player.queue.length) {
            player.backends[player.queue[0].backendName].prepareSong(player.queue[0].songID, function() {
                callHooks('onNextSongPrepared', [player, 0]);
                // do nothing
            }, function(err) {
                // error pre-caching, get rid of this song
                console.log('error! removing song from queue ' + player.queue[0].songID);
                callHooks('onNextSongPrepareError', [player, 0]);
                removeFromQueue(player.queue[0].backendName, player.queue[0].songID);
            });
        } else {
            console.log('no songs in queue to prepare');
            callHooks('onNothingToPrepare', [player]);
        }
    }, function(err) {
        // error pre-caching, get rid of this song
        console.log('error! removing song from queue ' + player.nowPlaying.songID);
        callHooks('onSongPrepareError', [player]);
        removeFromQueue(player.nowPlaying.backendName, player.nowPlaying.songID);
    });
};
player.onQueueModify = onQueueModify;

// find song from queue
var searchQueue = function(backendName, songID) {
    for(var i = 0; i < player.queue.length; i++) {
        if(player.queue[i].songID === songID
                && player.queue[i].backendName === backendName)
            return player.queue[i];
    }

    if(player.nowPlaying && player.nowPlaying.songID === songID
            && player.nowPlaying.backendName === backendName)
        return player.nowPlaying;

    return null;
};
player.searchQueue = searchQueue;

// get rid of song in queue
var removeFromQueue = function(backendName, songID) {
    for(var i = 0; i < player.queue.length; i++) {
        if(player.queue[i].songID === songID && player.queue[i].backendName === backendName) {
            player.queue.splice(i, 1);
            return;
        }
    }
};
player.removeFromQueue = removeFromQueue;

// TODO: partyplay specific stuff
// initialize song object
var initializeSong = function(song) {
    song.playbackStart = null;
    song.timeAdded = new Date().getTime();

    player.queue.push(song);
    return song;
};
player.initializeSong = initializeSong;

// add a song to the queue
//
// metadata is optional and can contain information passed between plugins
// (e.g. which user added a song)
var addToQueue = function(song, metadata) {
    // check that required fields are provided
    if(!song.title || !song.songID || !song.backendName || !song.duration) {
        console.log('required song fields not provided: ' + song.songID);
        return 'required song fields not provided';
    }

    // if same song is already queued, don't create a duplicate
    var queuedSong = searchQueue(song.backendName, song.songID);
    if(queuedSong) {
        console.log('not adding duplicate song to queue: ' + queuedSong.songID);
        return 'duplicate songID';
    }

    var err = callHooks('preSongQueued', [player, song, metadata]);
    if(err)
        return err;

    // no duplicate found, initialize a few properties of song
    queuedSong = initializeSong(song);

    callHooks('sortQueue', [player, metadata]);
    onQueueModify();

    console.log('added song to queue: ' + queuedSong.songID);
    callHooks('postSongQueued', [player, queuedSong, metadata]);
};
player.addToQueue = addToQueue;

_.each(config.plugins, function(pluginName) {
    // TODO: put plugin modules into npm
    // must implement .init, can implement hooks
    var plugin = require('./plugins/' + pluginName);

    plugin.init(player, function() {
        player.plugins[pluginName] = plugin;
        console.log('plugin ' + pluginName + ' initialized');
    }, function(err) {
        console.log('error in ' + pluginName + ': ' + err);
        callHooks('onPluginInitError', [player, plugin]);
    });
});

// TODO: maybe wait for callbacks before this?
callHooks('onPluginsInitialized', [player]);

// init backends
_.each(config.backends, function(backendName) {
    // TODO: put backend modules into npm
    // must implement .search, .prepareSong, .init
    var backend = require('./backends/' + backendName);

    backend.init(player, function() {
        player.backends[backendName] = backend;

        console.log('backend ' + backendName + ' initialized');
        callHooks('onBackendInit', [player, backend]);
    }, function(err) {
        console.log('error in ' + backendName + ': ' + err);
        callHooks('onBackendInitError', [player, backend]);
    });
});

// TODO: maybe wait for callbacks before this?
callHooks('onBackendsInitialized', [player]);

process.on('uncaughtException', function (err) {
    console.error(err.stack);
    console.log("ERROR! Node not exiting.");
});

