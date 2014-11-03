partyplay
=========

party playlist manager for cloud music services

features
--------

* google play music all access (currently no other services supported)
* partygoers can:
  * see current queue
  * search for songs
  * add songs to the queue
  * up/down vote songs in the queue
    * queue is sorted according to votes
    * songs where majority of votes are downvotes will be removed

setup
-----

1. install `ffmpeg`
2. create an [app password](https://security.google.com/settings/security/apppasswords)
3. `cp googlePlayCreds.json.example ~/.googlePlayCreds.json`
4. edit `~/.googlePlayCreds.json`
5. run `npm install`
6. run `PORT=8080 node index.js`, point web browser to `localhost:8080/server.html`
7. point client web browsers to `localhost:8080`

api
---

* simple REST api
  * GET `/search/rick astley` - returns 10 songs matching `rick astley`
  * GET `/queue` - returns current queue
  * POST `/queue` - queue a song
  * POST `/vote/songID` - cast a vote on songID
