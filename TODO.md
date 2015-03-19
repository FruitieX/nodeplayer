nodeplayer TODO
===============

Note: most of this was/should be moved to issues in relevant modules

### apis
- total queue length

### plugins
- plugins that use crypto keys: autogenerate keys if they are not present
- partyplay: disable or at least password protect "admin" API calls
- unit tests!

### backends
- album art
- support partial prepares, ie. starting from any position in the song
- pagination support for search results
- file backend should defer scanning until file has not changed for a while
- unit tests!

### web frontends
- rewrite web frontends using eg. angular.js
- get dependencies with bower
- qr code for partyplay

### CLI client
- use verifymac plugin instead of duplicating code
- clean unnecessary properties from song before storing a playlist
- less hacky music playback than now?

### android client
- supports streaming, controlling playback
- android wear support
- eventually local caching?
