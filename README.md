![Logo](/media/logo_text.png)

Simple, modular music player written in node.js

[![Build Status](https://travis-ci.org/FruitieX/nodeplayer.svg?branch=develop)](https://travis-ci.org/FruitieX/nodeplayer)

Disclaimer: for personal use only - make sure you configure nodeplayer
appropriately so that others can't access your music. I take no responsibility
for example if your streaming services find you are violating their ToS. You're running
this software entirely at your own risk!

Quickstart
----------

- `npm install -g nodeplayer` ([here's](https://github.com/sindresorhus/guides/blob/master/npm-global-without-sudo.md) how you can do this without sudo, *highly recommended*)
- `nodeplayer`

nodeplayer will now ask you to edit its configuration file. For a basic setup
the defaults should be good. You may want to add a few more backends and/or
plugins later, see below for some examples!

When you're done configuring, run `nodeplayer` again. nodeplayer now
automatically installs missing plugins and backends. Note that if you installed
nodeplayer as root (you *probably shouldn't*), this step also requires root
since modules are installed to the same path as nodeplayer.

Note that backends and plugins you load may ask you to perform additional
configuration steps. Read through the setup instructions for each of the
plugins/backends you enable, and read through the output they print to console
on first run. For example, the default nodeplayer configuration uses the
[youtube backend](https://github.com/FruitieX/nodeplayer-backend-youtube),
which might need some configuration before use. (uses a throwaway API key by
default)

All modules can be updated by running `nodeplayer -u`

### The nodeplayer project
* [nodeplayer](https://github.com/FruitieX/nodeplayer) The core music player component
* [nodeplayer-client](https://github.com/FruitieX/nodeplayer-client) CLI client for controlling nodeplayer
* [nodeplayer-player](https://github.com/FruitieX/nodeplayer-player) CLI audio playback client

#### Plugin modules
* [nodeplayer-plugin-express](https://github.com/FruitieX/nodeplayer-plugin-express) expressjs server
* [nodeplayer-plugin-httpauth](https://github.com/FruitieX/nodeplayer-plugin-httpauth) HTTP basic auth
* [nodeplayer-plugin-ipfilter](https://github.com/FruitieX/nodeplayer-plugin-ipfilter) IP filtering
* [nodeplayer-plugin-partyplay](https://github.com/FruitieX/nodeplayer-plugin-partyplay) Party playlist
* [nodeplayer-plugin-rest](https://github.com/FruitieX/nodeplayer-plugin-rest) REST API
* [nodeplayer-plugin-socketio](https://github.com/FruitieX/nodeplayer-plugin-socketio) socket.io API
* [nodeplayer-plugin-storequeue](https://github.com/FruitieX/nodeplayer-plugin-storequeue) Save the queue
* [nodeplayer-plugin-verifymac](https://github.com/FruitieX/nodeplayer-plugin-verifymac) Verify queue add operations
* [nodeplayer-plugin-weblistener](https://github.com/FruitieX/nodeplayer-plugin-weblistener) Web-based audio player

#### Backend modules
* [nodeplayer-backend-gmusic](https://github.com/FruitieX/nodeplayer-backend-gmusic)
* [nodeplayer-backend-youtube](https://github.com/FruitieX/nodeplayer-backend-youtube)
* [nodeplayer-backend-spotify](https://github.com/FruitieX/nodeplayer-backend-spotify)
* [nodeplayer-backend-file](https://github.com/FruitieX/nodeplayer-backend-file)

Introduction
------------

This repository contains the core nodeplayer module. As a standalone
component it is rather useless, as it is meant to be extended by other modules.
The core module manages a playback queue and initializes any external
modules that you have configured it to load. External modules are given various ways to
manipulate the queue, and without them you can't really interact with nodeplayer in any way!

External modules are categorized as follows:

* Backend modules: Sources of music
* Plugin modules: Extend the functionality of the core in various ways

By keeping nodeplayer modular it is possible to use it in a wide variety of
scenarios, ranging from being a basic personal music player to a party playlist
manager where partygoers can vote on songs. Or perhaps configure it as a
streaming music player to your mobile devices and when you come home, you can
simply switch music sources over to your PC since the music plays back in sync.
More cool functionality can easily be implemented by writing new modules!

For developers
--------------

NOTE: The API is NOT stable yet! Things may break at any time without warning,
I'm trying to stabilize things for [0.2.0](https://github.com/FruitieX/nodeplayer/milestones/0.2.0).
But [some issues](https://github.com/FruitieX/nodeplayer/labels/API%20change) still exist that will definitely change the plugin and backend API a bit (likewise for the [client API](https://github.com/FruitieX/nodeplayer/labels/Client%20API)).

### Pull requests

Code style adheres mostly to the [Google JavaScript Style Guide](https://google-styleguide.googlecode.com/svn/trunk/javascriptguide.xml),
with the following exceptions:

- One indent equals 4 spaces, not 2
- Maximum line length is 100, not 80
- UNIX endlines (LF) are enforced

Apart from unit tests, code is ran through `jshint` and `jscs` with above options.
Before submitting a pull request, make sure that your code passes the test suite.
This can be checked with:

    npm test

### Collaborators

This repository follows the principles of [git-flow](http://nvie.com/posts/a-successful-git-branching-model/)

### Modules

Modules are best developed by using `npm link`. This allows nodeplayer to load the module directly from your module repository. This is only possible when running nodeplayer directly from the [nodeplayer repository](https://github.com/FruitieX/nodeplayer),
so getting a clone is highly recommended. `npm link` can be used like so:

- First make sure your module has a `package.json` file
- In your module repository, run `npm link` ([here's](https://github.com/sindresorhus/guides/blob/master/npm-global-without-sudo.md) how you can do this without sudo, *highly recommended*)
- In the nodeplayer repository, link the module with `npm link nodeplayer-plugin-myplugin`
- Now you can develop your module inside its own repository, any changes will take
  effect immediately when you run nodeplayer.

#### Plugin modules

The core provides several functions for managing the queue to plugins, and
through the use of hooks the core will call a plugin's hook functions (if
defined) at well defined times.

TODO: template plugin

##### Initialization

A plugin module must export at least an init function:

    exports.init = function(player, logger, callback) {...};

The init functions:

* Are called once for each configured plugin when nodeplayer is started.
* Are called in sequence (unlike backends), and can thus depend on another plugin
  being loaded, possibly expanding the functionalities of that plugin.
* Are passed the following arguments:
  * player: reference to the player object in nodeplayer core, store this if you
    need it later.
  * logger: [winston](https://github.com/winstonjs/winston) logger with per-plugin tag,
    use this for logging! (log levels are: logger.silly, logger.debug, logger.info, logger.warn, logger.error)
  * callback: callback must be called with no arguments when you are done
    initializing the plugin. If there was an error initializing, call it with a
    string stating the reason for the error.

And there you have it, the simplest possible plugin. For more details, take a look at example
plugins linked at the top! Now let's make it actually do something by taking a look at *hook functions*!

##### Hook functions

Plugin hook functions are called by the core (usually) before or after completing
some specific task. For instance `onSongEnd` whenever a song ends, with the song as the first
and only argument. Anything with a reference to the player object can call hook functions like so:

    player.callHooks('hookName', [arg1, arg2, ...]);

This will call the hook function `hookName` in every plugin that has defined a
function with that name, in the order the plugins were loaded, with `arg1,
arg2, ...` as arguments. Simply define a hook function, eg. `hookName` in the plugin as such:

    exports.hookName = function(arg1, arg2, ...) {...};

If any hook returns a truthy value it is an error that will also be returned by
`callHooks()`, and `callHooks()` will stop iterating through other hooks with the same name.

###### List of hook functions with explanations (FIXME: might be out of date, grep the code for `callHooks` to be sure)

* `onSongChange(np)` - song has changed to `np`
* `onSongEnd(np)` - song `np` ended
* `onSongPause(np)` - song `np` was paused
* `onSongPrepareError(song, err)` - preparing `song` failed with `err`
* `onSongPrepared(song)` - preparing `song` succeeded
* `onPrepareProgress(song, s, done)` - data (`s` bytes) related to `song` written to disk. If `done` true then we're done preparing the song.
* `onEndOfQueue()` - queue ended
* `onQueueModify(queue)` - queue was potentially modified
* `preAddSearchResult(song)` - about to add search result `song`, returning a truthy value rejects search result
* `preSongsRemoved(pos, cnt)` - about to remove `cnt` amount of songs starting at `pos`. TODO: these should probably be possible to reject
* `postSongsRemoved(pos, cnt)` - removed `cnt` amount of songs starting at `pos`
* `preSongsQueued(songs, pos)` - about to queue `songs` to `pos`
* `postSongsQueued(songs, pos)` - queued `songs` to `pos`
* `preSongQueued(song)` - about to queue `song` to `pos`
* `postSongQueued(song)` - queued `song` to `pos`
* `sortQueue()` - queue sort hook
* `onPluginInitialized(plugin)` - `plugin` was initialized
* `onPluginInitError(plugin, err)` - `err` while initializing `plugin`
* `onPluginsInitialized()` - all plugins were initialized
* `onBackendInitialized(backend)` - `backend` was initialized
* `onBackendInitError(backend, err)` - `err` while initializing `backend`
* `onBackendsInitialized()` - all backends were initialized

#### Backend modules

Backend modules are sources of music and need to export the following functions:

```
exports.init = function(player, logger, callback) {...};
```

* Very similar to the plugin init function
* Perform necessary initialization here
* Run callback with descriptive string argument on error, and no argument on success.

```
exports.search = function(query, callback, errCallback) {...};
```

* Used for searching songs in your backend. `query` contains a `terms` property
  which represents the search terms
* Callback should be called with results on success
* errCallback should be called with descriptive error string on error
* Results are a JavaScript object like so:

```
{
    songs: {
        dummySongID1: {   // dummySongID1 should equal to the value of songID inside the song object
            ...
        },
        dummySongID1: {
            ...
        },
    }
}
```
* You can also choose to include some custom metadata as keys in the object, these will
  be passed along with the results. (eg. pagination)
* Song objects look like this:
```
{
    artist: 'dummyArtist',
    title: 'dummyTitle',
    album: 'dummyAlbum',
    albumArt: {             // URLs to album art, must contain 'lq' (low quality) and 'hq' (high quality) links
        lq: 'http://dummy.com/albumArt.png',
        hq: 'http://dummy.com/albumArt_HighQuality.png'
    },
    duration: 123456,       // in milliseconds
    songID: 'dummySongID1', // a string uniquely identifying the song in your backend
    score: i,               // how relevant is this result, ideally from 0 (least relevant) to 100 (most relevant)
    backendName: 'dummy',   // name of this backend
    format: 'opus'          // file format/extension of encoded song
};
```

And finally, get ready for the insane one doing all the heavy lifting:
```
exports.prepareSong = function(song, progCallback, errCallback) {...};
```

* Called by the core when it wants backend to prepare audio data to disk.
* Audio data should be encoded and stored in for example:
    * `/home/user/.nodeplayer/song-cache/backendName/songID.opus`
    * Use the following functions/variables to build up the path:
        * config.getConfigDir()
        * path.sep
* When more audio data has been written to disk, call progCallback with arguments:
    * song object (song)
    * Number of bytes written to disk
    * true/false: is the whole song now written to disk?
* Call errCallback with descriptive error string if something goes wrong, nodeplayer
  will then remove all instances of that song from the queue and skip to the next song.
* `prepareSong` should return a function which if called, will cancel the preparation
  process and clean up any song data written so far. Nodeplayer may call this function
  if for example the song is skipped.

```
exports.isPrepared = function(song) {...};
```

* Called by nodeplayer to check if preparation is needed or not
* Returns `true` if the song is prepared, `false` otherwise
* Is allowed to return `true` while the song is being prepared
* Often just a `return fs.existsSync(filePath)`

TODO: template backend

For more details, take a look at example backends linked at the top!
