nodeplayer
==========

Simple, modular music player written in node.js

[![Build Status](https://travis-ci.org/FruitieX/nodeplayer.svg?branch=master)](https://travis-ci.org/FruitieX/nodeplayer)

Disclaimer: for personal use only - make sure you configure nodeplayer
appropriately so that others can't access your music. I take no responsibility
for example if your streaming services find you are violating their ToS. You're running
this software entirely on your own risk!

Quickstart
----------

    git clone https://github.com/FruitieX/nodeplayer
    cd nodeplayer
    npm install
    npm start
    
for users
---------

### introduction

This repository contains the core nodeplayer application. As a standalone
component it is rather useless, as it is meant to be extended by other modules.
In essence, the core application manages a playback queue and initializes any
modules that you have configured it to load. Modules are given various ways to
manipulate the queue, but without modules you can't really do anything!

Apart from the core, nodeplayer is split up into several components where each
component belongs to one of two categories:

* Backend modules: Sources of music
* Plugin modules: Extend the functionality of the core in various ways

By keeping nodeplayer modular it is possible to use it in a wide variety of
scenarios, ranging from being a basic personal music player to a party playlist
manager where partygoers can vote on songs. Or perhaps configure it as a
streaming music player to your mobile devices and when you come home, you can
simply switch music sources over to your PC since the music plays back in sync.
More cool functionality can easily be implemented by writing new modules.

For developers
--------------

### Pull requests

Code style adheres mostly to the [Google JavaScript Style Guide](https://google-styleguide.googlecode.com/svn/trunk/javascriptguide.xml),
with the following exceptions:

- One indent equals 4 spaces, not 2
- Maximum line length is 100, not 80
- UNIX endlines (LF) are enforced

Apart from unit tests, code is ran through jshint and jscs with above options.
Before submitting a pull request, make sure that your code passes the test suite.
This can be checked with:

    npm test

### plugins

The core provides several functions for managing the queue to plugins, and
through the use of hooks the core will call the plugin's hook functions (if
defined) at certain times.

#### initialization

A plugin must export at least an init function:

    exports.init = function(player, callback) {...};

* Called for each configured plugin when nodeplayer is started.
* Arguments:
  * player: reference to the player object in nodeplayer core, store this if you
    need it later
  * callback: callback must be called with no arguments when you are done
    initializing the plugin. If there was an error initializing, call it with a
    string stating the reason of the error.

And there you have it, the simplest possible plugin. Now let's take a look at
hook functions!

#### hook functions

Plugin hook functions are called by the core (usually) before or after completing
some task. For instance `onSongEnd` will be called with the song that ended as
the argument whenever a song ends. Hooks are called by calling:

    player.callHooks('hookName', [arg1, arg2, ...]);

This will call the hook function `hookName` in every plugin that has defined a
function with that name, in the order the plugins were loaded, with `arg1,
arg2, ...` as arguments. Simply define the hook function in the plugin as such:

    exports.hookName = function(arg1, arg2, ...) {...};

If any hook returns a truthy value it is an error that will also be returned by
`callHooks()`, and potential further hooks will not be ran.

##### list of hook functions with explanations

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

### backend modules

TODO

### The nodeplayer project
* [nodeplayer](https://github.com/FruitieX/nodeplayer) The core music player
* [nodeplayer-client](https://github.com/FruitieX/nodeplayer-client) CLI client for controlling nodeplayer
* [nodeplayer-player](https://github.com/FruitieX/nodeplayer-player) CLI audo playback client
* [nodeplayer-defaults](https://github.com/FruitieX/nodeplayer-defaults) Default configuration file

#### Backend modules
* [nodeplayer-gmusic](https://github.com/FruitieX/nodeplayer-gmusic)
* [nodeplayer-youtube](https://github.com/FruitieX/nodeplayer-youtube)
* [nodeplayer-spotify](https://github.com/FruitieX/nodeplayer-spotify)
* [nodeplayer-file](https://github.com/FruitieX/nodeplayer-file)
