partyplay
=========

party playlist manager

disclaimer: for personal use only - make sure you configure IP filtering
properly so that others can't access your music

features
--------

* backend services as modules:
  * gmusic
  * spotify (TODO)
  * youtube (TODO)
  * local (TODO)
* partygoers can:
  * see current queue
  * search for songs
  * add songs to the queue
  * up/down vote songs in the queue
    * queue is sorted according to votes
    * songs where majority of votes are downvotes will be removed

setup
-----

1. install `ffmpeg` - needed to determine exact length of songs
2. configure partyplay:
    * `cp partyPlayConfigDefaults.js ~/.partyplayConfig.js`
    * edit `~/.partyPlayConfig.js`
3. install dependencies:
    * run `npm install`
4. run the server:
    * run `PORT=8080 node index.js`
5. test!
    * point listener to `http://localhost:8080/listener.html`
    * point clients to `http://localhost:8080`

backends setup
--------------

* gmusic
    * create an [app password](https://security.google.com/settings/security/apppasswords)
    * `cp googlePlayCreds.json.example ~/.googlePlayCreds.json`
    * edit `~/.googlePlayCreds.json`
    * enable backend in `~/.partyPlayConfig.js`
* spotify
    * TODO
* youtube
    * TODO
* local
    * TODO

api (OUTDATED)
--------------

* simple REST api
  * GET `/search/rick astley` - returns 10 songs matching `rick astley`
  * GET `/queue` - returns current queue
  * POST `/queue` - queue a song
  * POST `/vote/songID` - cast a vote on songID
