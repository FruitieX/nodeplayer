'use strict';
var should = require('chai').should();
var _ = require('underscore');
var Player = require('../player');
var exampleQueue = require('./exampleQueue.json');

describe('exampleQueue', function() {
    it('should contain at least 5 items', function() {
        exampleQueue.length.should.be.above(5);
    });
});

describe('Player', function() {
    describe('#setVolume()', function() {
        var player;

        beforeEach(function() {
            player = new Player();
        });
        it('should set volume to 1 by default', function() {
            player.volume.should.equal(1).and.be.a('number');
        });
        it('should set volume to 0 for negative values', function() {
            player.setVolume(-1);
            player.volume.should.equal(0).and.be.a('number');
        });
        it('should set volume to 1 for values greater than 1', function() {
            player.setVolume(42);
            player.volume.should.equal(1).and.be.a('number');
        });
        it('should set volume to 0.5', function() {
            player.setVolume(0.5);
            player.volume.should.equal(0.5).and.be.a('number');
        });
    });

    describe('#skipSongs()', function() {
        var player;
        var playedQueueSize = 3; // TODO: better handling of config variables here

        beforeEach(function() {
            player = new Player();
            player.queue = _.clone(exampleQueue);
            player.config.playedQueueSize = playedQueueSize;
        });
        it('should put a skipped song into playedQueue', function() {
            player.skipSongs(1);
            _.last(player.playedQueue).should.deep.equal(_.first(exampleQueue));
        });
        it('should put multiple skipped songs into playedQueue', function() {
            player.skipSongs(2);
            _.last(player.playedQueue, 2).should.deep.equal(_.first(exampleQueue, 2));
        });
        it('should put up to playedQueueSize songs into playedQueue if skipping by a large amount', function() {
            player.skipSongs(exampleQueue.length + 100);
            player.playedQueue.should.deep.equal(_.last(exampleQueue, playedQueueSize));
        });
        it('should put last song from playedQueue into queue when skipping to prev song', function() {
            player.skipSongs(exampleQueue.length + 100);
            player.skipSongs(-1);
            _.first(player.queue).should.deep.equal(_.last(exampleQueue));
        });
        it('should put up to playedQueueSize songs from playedQueue into queue when skipping to prev songs', function() {
            player.skipSongs(exampleQueue.length + 100);
            player.skipSongs((playedQueueSize + 100) * -1);
            player.queue.should.deep.equal(_.last(exampleQueue, playedQueueSize));
        });
    });

    describe('#shuffleQueue()', function() {
        var player;

        beforeEach(function() {
            player = new Player();
            player.queue = _.clone(exampleQueue);
        });
        it('should not change the now playing song', function() {
            for(var i = 0; i < 10; i++) {
                // no matter how many times we shuffle :-)
                player.shuffleQueue();
                _.first(player.queue).should.deep.equal(_.first(exampleQueue));
            }
        });
    });
})
