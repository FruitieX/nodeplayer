var queue = [];
var searchResults = {};
var resultsCount = 10;
var progress = {started: 0, interval: null};

var socket;

var search = function() {
    var searchTerms = $('#search-terms').val();
    $('#search-button').prop('disabled', true);

    $.ajax({
        type: 'POST',
        url: '/search',
        data: JSON.stringify({
            terms: searchTerms
            //pageToken: 0 // don't use unless you really want a specific page
        }),
        contentType: 'application/json'
    })
    .done(function(data) {
        searchResults = JSON.parse(data);
        $('#search-results').empty();
        $('#search-results-text').removeClass('hidden');
        $('#search-button').prop('disabled', false);

        // TODO: separate backends somehow
        // right now we just sort songs by score
        var songs = [];
        _.each(_.pluck(searchResults, 'songs'), function(backendSongs) {
            _.each(backendSongs, function(song) {
                songs.push(song);
            });
        });
        songs = _.sortBy(songs, 'score').reverse();
        _.each(songs, function(song) {
            $.tmpl('searchTemplate', {
                title: song.title,
                artist: song.artist,
                album: song.album,
                albumArt: song.albumArt,
                duration: durationToString(song.duration / 1000),
                songID: song.songID,
                backendName: song.backendName
            }).appendTo('#search-results');
        });
        /*
            var songsInOrder = _.sortBy(searchResults[backendName].songs, 'score');
            _.each(songsInOrder, function(songID) {
                var song = searchResults[backendName].songs[songID];
            });
        });
        */
        // TODO: pagination using backendResults.next/prevPageToken
        /*
        if (searchResults.length > resultsCount) {
            $.tmpl( 'ellipsisTemplate', {
                title: '...',
            }).appendTo('#search-results');
        }
        */
    }).fail(function() {
        $('#search-button').prop('disabled', false);
    });
};

var vote = function(pos, vote) {
    var upArrow = $('#uparrow' + pos);
    var downArrow = $('#downarrow' + pos);
    if (vote > 0) {
        // is already upvoted: remove upvote
        if (upArrow.hasClass('active')) {
            upArrow.removeClass('active');
            vote = 0;
        // upvote
        } else {
            upArrow.addClass('active');
        }
        downArrow.removeClass('active');
    } else if (vote < 0) {
        if (downArrow.hasClass('active')) {
            // is already downvoted: remove downvote
            downArrow.removeClass('active');
            vote = 0;
        } else {
            // downvote
            downArrow.addClass('active');
        }
        upArrow.removeClass('active');
    }

    $.ajax({
        type: 'POST',
        url: '/vote',
        data: JSON.stringify({
            vote: vote,
            userID: $.cookie('userID'),
            pos: pos
        }),
        contentType: 'application/json'
    });
};

var appendQueue = function(backendName, songID) {
    if (songID !== 0 && !songID) { return; }
    if (!backendName) { return; }
    searchResults[backendName].songs[songID].userID = $.cookie('userID');
    $.ajax({
        type: 'POST',
        url: '/queue',
        data: JSON.stringify({
            songs: [searchResults[backendName].songs[songID]]
        }),
        contentType: 'application/json'
    });

    $('#search-results').empty();
    $('#search-results-text').addClass('hidden');
};

var pad = function(number, length) {
    var str = '' + number;

    while (str.length < length) {
        str = '0' + str;
    }

    return str;
};

var updateProgress = function(dt) { // dt = ms passed since last call
    if (!queue[0]) {
        clearInterval(progress.interval);
        return;
    }

    var currentProgress = new Date() - progress.started;
    $('#progress').css('width', 100 * (currentProgress / progress.duration) + '%');
    if (currentProgress > progress.duration) {
        $('#progress').css('width', '100%');
    }
};

var updateQueue = function() {
    var i;
    $('#queue').empty();

    if (queue) {
        console.log(queue);
        // now playing
        if (queue[0]) {
            queue[0].duration = durationToString(queue[0].duration / 1000);
            $.tmpl('nowPlayingTemplate', queue[0]).appendTo('#queue');
            updateProgress(0);
        }

        // rest of queue
        for (i = 1; i < queue.length; i++) {
            queue[i].duration = durationToString(queue[i].duration / 1000);
            queue[i].pos = i;
            $.tmpl('queueTemplate', queue[i]).appendTo('#queue');
            var numUpVotes = Object.keys(queue[i].upVotes || {}).length;
            var numDownVotes = Object.keys(queue[i].downVotes || {}).length;
            var totalVotes = numUpVotes + numDownVotes;

            var weightedUp = 1 - (totalVotes - numUpVotes) / totalVotes;
            var weightedDown = 1 - (totalVotes - numDownVotes) / totalVotes;

            var r = 'f0';
            var g = 'f0';
            var b = 'f0';

            if (totalVotes) {
                if (numUpVotes > numDownVotes) {
                    r = pad(Number(255 - Math.round(40 * weightedUp)).toString(16), 2);
                    b = pad(Number(255 - Math.round(40 * weightedUp)).toString(16), 2);
                } else if (numUpVotes < numDownVotes) {
                    g = pad(Number(255 - Math.round(40 * weightedDown)).toString(16), 2);
                    b = pad(Number(255 - Math.round(40 * weightedDown)).toString(16), 2);
                }
            }

            var color = '#' + r + g + b;

            document.getElementById(queue[i].backendName + queue[i].songID)
                .style['background-color'] = color;
        }

        var userID = $.cookie('userID');
        // update votes
        for (i = 1; i < queue.length; i++) {
            if (queue[i].upVotes && queue[i].upVotes[userID]) {
                $('#uparrow' + i).addClass('active');
            } else if (queue[i].downVotes && queue[i].downVotes[userID]) {
                $('#downarrow' + i).addClass('active');
            }
        }
    }
};

var durationToString = function(seconds) {
    var durationString = Math.floor(seconds / 60);
    durationString += ':' + pad(Math.floor(seconds % 60), 2);
    return durationString;
};

$(document).ready(function() {
    detectPrivateMode(function(isPrivate) {
        if (isPrivate) {
            $('body').html('Private browsing unsupported to prevent abuse.<br>' +
                '<img src="media/antitroll.png"></img>');
            return;
        }

        // generate a user ID if there is not one yet
        if (!$.cookie('userID')) {
            var s4 = function() {
                return Math.floor((1 + Math.random()) * 0x10000)
                    .toString(16)
                    .substring(1);
            };
            var guid = s4() + s4() + '-' + s4() + '-' + s4() + '-' +
                    s4() + '-' + s4() + s4() + s4();
            $.cookie('userID', guid);
        }

        var nowPlayingMarkup =
            '<li class="list-group-item now-playing" id="${backendName}${songID}">' +
            '<div id="progress"></div>' +
            '<div class="np-songinfo">' +
            '<div class="big"><b>${title}</b> - ${duration}</div>' +
            '<div class="small"><b>${artist}</b> (${album})</div>' +
            '</div>' +
            '</li>';

        $.template('nowPlayingTemplate', nowPlayingMarkup);

        var queueMarkup =
            '<li class="list-group-item" id="${backendName}${songID}">' +
            '<div class="arrows downarrow glyphicon glyphicon-thumbs-down" ' +
                'id="downarrow${pos}"  onclick="vote(\'${pos}\', -1);"></div>' +

            '<div class="arrows uparrow glyphicon glyphicon-thumbs-up"' +
                'id="uparrow${pos}" onclick="vote(\'${pos}\', 1);"></div>' +

            '<div class="songinfo">' +
            '<div class="big"><b>${title}</b> - ${duration}</div>' +
            '<div class="small"><b>${artist}</b> (${album})</div>' +
            '</div>' +
            '</li>';

        $.template('queueTemplate', queueMarkup);

        var searchResultMarkup =
            '<li class="list-group-item searchResult" ' +
                'id="${backendName}${songID}"' +
                'onclick="appendQueue(\'${backendName}\', \'${songID}\')">' +

            '<div class="big"><b>${title}</b> - ${duration}</div>' +
            '<div class="small"><b>${artist}</b> (${album})</div>' +
            '</li>';

        $.template('searchTemplate', searchResultMarkup);

        var ellipsisResultMarkup =
            '<li class="list-group-item searchResult" id="${backendName}${songID}">' +
            '<div class="big">${title}</div>' +
            '</li>';

        $.template('ellipsisTemplate', ellipsisResultMarkup);

        $('#search-terms').keyup(function(e) {
            if (e.keyCode === 13) {
                search();
            }
        });

        socket = io();
        socket.on('queue', function(data) {
            queue = data;
            updateQueue();
        });

        socket.on('playback', function(data) {
            console.log(data);
            var currentProgress = (data.position || 0);
            progress.started = new Date() - currentProgress;
            progress.duration = data.duration;

            clearInterval(progress.interval);
            if (data.playbackStart) {
                progress.interval = setInterval(function() {
                    updateProgress(100);
                }, 100);
            }
        });
    });
});
