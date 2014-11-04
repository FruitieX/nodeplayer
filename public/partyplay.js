var socket = io();
socket.on('queue', function(queue) {
    updateQueue(queue);
});

var searchResults = [];

var search = function() {
    var searchTerms = $("#search-terms").val();
    $("#search-button").prop('disabled', true);

    $.ajax('/search/' + searchTerms).done(function(data) {
        searchResults = JSON.parse(data);
        $("#search-results").empty();
        $("#search-results-text").removeClass('hidden');
        $("#search-button").prop('disabled', false);

        for (var i = 0; i < searchResults.length; i++) {
            $.tmpl( "searchTemplate", {
                title: searchResults[i].title,
                artist: searchResults[i].artist,
                duration: searchResults[i].duration,
                searchID: i
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

var updateQueue = function(queue) {
    $("#queue").empty();

    // now playing
    if(queue[0])
        $.tmpl( "nowPlayingTemplate", queue[0]).appendTo("#queue");

    queue = queue[1];
    // rest of queue
    for(var i = 0; i < queue.length; i++) {
        $.tmpl( "queueTemplate", queue[i]).appendTo("#queue");
        var numUpVotes = Object.keys(queue[i].upVotes).length;
        var numDownVotes = Object.keys(queue[i].downVotes).length;
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

        $("#" + queue[i].id).css('background-color', color);
    }

    var userID = $.cookie('userID');
    // update votes
    for(var i = 0; i < queue.length; i++) {
        if(queue[i].upVotes[userID]) {
            $("#uparrow" + queue[i].id).addClass("active");
        } else if(queue[i].downVotes[userID]) {
            $("#downarrow" + queue[i].id).addClass("active");
        }
    }
};

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
        + '<div class="nowplayingicon">'
        + '<span class="glyphicon glyphicon-play"></span>'
        + '</div>'
        + '<div class="title">${title}</div>'
        + '<div class="artist">${artist}</div>'
        + '</li>';

    $.template( "nowPlayingTemplate", nowPlayingMarkup );

    var queueMarkup = '<li class="list-group-item" id="${id}">'
        + '<div class="arrows">'
        + '<div class="uparrow">'
        + '<span class="glyphicon glyphicon-thumbs-up" id="uparrow${id}" onclick="vote(\'${id}\', 1);"></span>'
        + '</div>'
        + '<div class="downarrow">'
        + '<span class="glyphicon glyphicon-thumbs-down" id="downarrow${id}" onclick="vote(\'${id}\', -1);"></span>'
        + '</div>'
        + '</div>'
        + '<div class="title">${title}</div>'
        + '<div class="artist">${artist}</div>'
        + '</li>';

    $.template( "queueTemplate", queueMarkup );

    var searchResultMarkup = '<li class="list-group-item searchResult" id="${id}" onclick="appendQueue(${searchID})">'
        + '<div class="title">${title}</div>'
        + '<div class="artist">${artist}</div>'
        + '</li>';

    $.template( "searchTemplate", searchResultMarkup );

    $("#search-terms").keyup(function(e) {
        if(e.keyCode === 13)
            search();
    });
});
