var PlayMusic = require('playmusic');
var creds = require(process.env.HOME + '/.googlePlayCreds.json');

var pm = new PlayMusic();

pm.init(creds, function() {
    pm.search("rick astley never gonna give you up", 5, function(data) {
        var song = data.entries.sort(function(a, b) {
            return a.score < b.score;
        }).shift();
        console.log(song);
        pm.getStreamUrl(song.track.nid, function(streamUrl) {
            console.log(streamUrl);
        });
    }, function(err) {
        console.log(err);
    });
});
