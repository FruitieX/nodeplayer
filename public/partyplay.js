var queue = [];
var searchResults = [];
var resultsCount = 10;
var progress = {started: 0, interval: null};

var socket = io();
socket.on('queue', function(data) {
    queue = data;
    updateQueue();
});

socket.on('playback', function(data) {
    var currentProgress = (data.position || 0);
    progress.started = new Date() - currentProgress;
    progress.duration = data.duration;

    clearInterval(progress.interval);
    progress.interval = setInterval(function() {
        updateProgress(100);
    }, 100);
});

var search = function() {
    var searchTerms = $("#search-terms").val();
    $("#search-button").prop('disabled', true);

    $.ajax('/search/' + searchTerms).done(function(data) {
        searchResults = JSON.parse(data);
        $("#search-results").empty();
        $("#search-results-text").removeClass('hidden');
        $("#search-button").prop('disabled', false);

        for (var i = 0; i < Math.min(searchResults.length, resultsCount); i++) {
            $.tmpl( "searchTemplate", {
                title: searchResults[i].title,
                artist: searchResults[i].artist,
                album: searchResults[i].album,
                duration: durationToString(searchResults[i].duration / 1000),
                searchID: i
            }).appendTo("#search-results");
        }
        if (searchResults.length > resultsCount) {
            $.tmpl( "searchTemplate", {
                title: "...",
            }).appendTo("#search-results");
        }
    }).fail(function() {
        $("#search-button").prop('disabled', false);
    });
};

var vote = function(id, vote) {
    var upArrow = $("#uparrow" + id);
    var downArrow = $("#downarrow" + id);
    if(vote > 0) {
        // is already upvoted: remove upvote
        if(upArrow.hasClass("active")) {
            $("#uparrow" + id).removeClass("active");
            vote = 0;
        // upvote
        } else {
            $("#uparrow" + id).addClass("active");
        }
        $("#downarrow" + id).removeClass("active");
    } else if(vote < 0) {
        // is already downvoted: remove downvote
        if(downArrow.hasClass("active")) {
            $("#downarrow" + id).removeClass("active");
            vote = 0;
        // downvote
        } else {
            $("#downarrow" + id).addClass("active");
        }
        $("#uparrow" + id).removeClass("active");
    }

    $.ajax({
        type: 'POST',
        url: '/vote/' + id,
        data: JSON.stringify({
            vote: vote,
            userID: $.cookie('userID')
        }),
        contentType: 'application/json'
    });
};

var appendQueue = function(searchID) {
    if (searchID !== 0 && !searchID) return;
    $.ajax({
        type: 'POST',
        url: '/queue',
        data: JSON.stringify({
            song: searchResults[searchID],
            userID: $.cookie('userID')
        }),
        contentType: 'application/json'
    });

    $("#search-results").empty();
    $("#search-results-text").addClass('hidden');
};

var pad = function(number, length) {
    var str = '' + number;

    while (str.length < length) {
        str = '0' + str;
    }

    return str;
}

var updateProgress = function(dt) { // dt = ms passed since last call
    if(!queue[0]) {
        clearInterval(progress.interval);
        return;
    }

    var currentProgress = new Date() - progress.started;
    $("#progress").css("width", 100 * (currentProgress / progress.duration) + "%");
    if (currentProgress > progress.duration) {
        $("#progress").css("width", "100%");
    }
}

var updateQueue = function() {
    $("#queue").empty();

    // now playing
    if(queue[0]) {
        $.tmpl( "nowPlayingTemplate", queue[0]).appendTo("#queue");
        updateProgress(0);
    }

    // rest of queue
    for(var i = 0; i < queue[1].length; i++) {
        var tmp = queue[1][i];
        tmp.duration = durationToString(queue[1][i].duration / 1000);
        $.tmpl( "queueTemplate", tmp).appendTo("#queue");
        var numUpVotes = Object.keys(queue[1][i].upVotes).length;
        var numDownVotes = Object.keys(queue[1][i].downVotes).length;
        var totalVotes = numUpVotes + numDownVotes;

        var weightedUp = 1 - (totalVotes - numUpVotes) / totalVotes;
        var weightedDown = 1 - (totalVotes - numDownVotes) / totalVotes;

        var r = 'f0', g = 'f0', b = 'f0';

        if(totalVotes) {
            if(numUpVotes > numDownVotes) {
                r = pad(Number(255 - Math.round(40 * weightedUp)).toString(16), 2);
                b = pad(Number(255 - Math.round(40 * weightedUp)).toString(16), 2);
            } else if(numUpVotes < numDownVotes) {
                g = pad(Number(255 - Math.round(40 * weightedDown)).toString(16), 2);
                b = pad(Number(255 - Math.round(40 * weightedDown)).toString(16), 2);
            }
        }

        var color = "#" + r + g + b;

        $("#" + queue[1][i].id).css('background-color', color);
    }

    var userID = $.cookie('userID');
    // update votes
    for(var i = 0; i < queue[1].length; i++) {
        if(queue[1][i].upVotes[userID]) {
            $("#uparrow" + queue[1][i].id).addClass("active");
        } else if(queue[1][i].downVotes[userID]) {
            $("#downarrow" + queue[1][i].id).addClass("active");
        }
    }
};

var durationToString = function(seconds) {
    var durationString = Math.floor(seconds / 60);
    durationString += "m" + Math.floor(seconds % 60) + "s";
    return durationString;
}

$(document).ready(function() {
    // generate a user ID if there is not one yet
    if(!$.cookie('userID')) {
        var s4 = function() {
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
        }
        var guid = s4() + s4() + '-' + s4() + '-' + s4() + '-' +
                s4() + '-' + s4() + s4() + s4();
        $.cookie('userID', guid);
    }

    var nowPlayingMarkup = '<li class="list-group-item now-playing" id="${id}">'
        + '<div id="progress"></div>'
        + '<div class="nowplayingicon">'
        + '<span class="glyphicon glyphicon-play"></span>'
        + '</div>'
        + '<div class="big">${title}</div>'
        + '<div class="small">${artist}</div>'
        + '</li>';

    $.template( "nowPlayingTemplate", nowPlayingMarkup );

    var queueMarkup = '<li class="list-group-item" id="${id}">'
        + '<div class="row">'
        + '<div class="col-lg-1">'
        + '<div class="arrows downarrow glyphicon glyphicon-thumbs-down" id="downarrow${id}"  onclick="vote(\'${id}\', -1);"></div>'
        + '</div>'
        + '<div class="col-lg-10">'
        + '<div class="big"><div class="left">${title}</div><div class="right">${duration}</div></div>'
        + '<div style="clear:both"/>'
        + '<div class="small"><div class="left">${artist}</div><div class="right">${album}</div></div>'
        + '</div>'
        + '<div class="col-lg-1">'
        + '<div class="arrows uparrow glyphicon glyphicon-thumbs-up" id="uparrow${id}" onclick="vote(\'${id}\', 1);"></div>'
        + '</div>'
        + '</div>'
        + '</li>';

    $.template( "queueTemplate", queueMarkup );

    var searchResultMarkup = '<li class="list-group-item searchResult" id="${id}" onclick="appendQueue(${searchID})">'
        + '<div class="big"><div class="left">${title}</div><div class="right">${duration}</div></div>'
        + '<div style="clear:both"/>'
        + '<div class="small"><div class="left">${artist}</div><div class="right">${album}</div></div>'
        + '<div style="clear:both"/>'
        + '</li>';

    $.template( "searchTemplate", searchResultMarkup );

    $("#search-terms").keyup(function(e) {
        if(e.keyCode === 13)
            search();
    });
});
