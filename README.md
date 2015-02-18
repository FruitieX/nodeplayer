nodeplayer
==========

simple, modular music player written in node.js

disclaimer: for personal use only - make sure you configure nodeplayer
appropriately so that others can't access your music. I take no responsibility
eg. if your streaming services find you are violating their ToS, you're running
this software entirely on your own risk!

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

### setup

TODO

for developers
--------------

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
* `preSongsRemoved(pos, cnt)` - about to remove `cnt` amount of songs starting at `pos`
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
