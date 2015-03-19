nodeplayer TODO
===============

### core
- standalone program
- play/pause a bit unintuitive
- timeout preparing requests after a certain time
- use unique queue item ids for songs in the queue and address songs with this
- write tests also for logger.js and index.js

### apis
- total queue length
- move command for queue items
- send queue updates as add/remove commands instead of entire queue each time

### plugins
- plugins that use keys: autogenerate keys if they are not present
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
