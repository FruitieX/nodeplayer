'use strict';
var _ = require('underscore');
var logger = require('./logger')('playlist');
var fs = require('fs');
var path = require('path');
var uuid = require('node-uuid');

var baseDir = require('./config').getBaseDir();

function Playlist(songs, name, player) {
    _.bindAll.apply(_, [this].concat(_.functions(this)));

    this.songs = songs || [];
    this.name = name;
    this.player = player;
    this.uuid = uuid.v4();
}

Playlist.prototype.insert = function(index, songs) {
    var err = this.player.callHooks('prePlaylistInsert', [this.uuid, index, songs]);
    if (err) {
        logger.error('error while inserting song:', err);
        return;
    }

    Array.prototype.splice.apply(this.songs, [index, 0].concat(songs));

    this.player.callHooks('postPlaylistInsert', [this.uuid, index, songs]);
};

Playlist.prototype.remove = function(index, cnt) {
    var err = this.player.callHooks('prePlaylistRemove', [this.uuid, index, cnt]);
    if (err) {
        logger.error('error while inserting song:', err);
        return;
    }

    this.songs.splice(index, cnt);

    this.player.callHooks('postPlaylistRemove', [this.uuid, index, cnt]);
};

// offset and cnt are optional. cnt can be negative to select from end
Playlist.prototype.getSongs = function(offset, cnt) {
    return this.songs.slice(offset || 0, cnt);
};

Playlist.prototype.setName = function(name) {
    var oldName = this.name;

    this.name = name;

    this.player.callHooks('onPlaylistNameChange', [this.uuid, oldName, name]);
};

Playlist.prototype.save = function(callback) {
    var playlistPath = path.join(baseDir, this.name, '.json');
    fs.writeFile(playlistPath, JSON.stringify(this.songs), callback);

    this.player.callHooks('onPlaylistSaved', [this.uuid, this.name, this.songs]);
};

Playlist.prototype.load = function(callback) {
    var playlistPath = path.join(baseDir, this.name, '.json');
    fs.readFile(playlistPath, function(err, data) {
        if (err) {
            callback(err);
        } else {
            this.songs = JSON.parse(data);
            this.player.callHooks('onPlaylistLoaded', [this.uuid, this.name, this.songs]);
            callback();
        }
    });
};

module.exports = Playlist;
