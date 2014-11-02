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

api
---

* simple REST api
  * GET `/search/rick astley` - returns 10 songs matching `rick astley`
  * GET `/queue` - returns current queue
  * POST `/queue` - queue a song
  * POST `/vote/songID` - cast a vote on songID
