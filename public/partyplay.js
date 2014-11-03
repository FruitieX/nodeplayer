var search = function() {
    var searchTerms = $("#search-terms").val();

    $.ajax('/search/' + searchTerms).done(function(data) {
        var searchResults = JSON.parse(data);
        $("#queue").empty();

        for (var i = 0; i < searchResults.length; i++) {
            $.tmpl( "searchTemplate", searchResults[i]).appendTo("#search-results");
        }
    });
};

var vote = function(id, vote) {
    console.log('vote ' + vote + ' '+ id);
};

var insertQueue = function(song) {
    console.log('insert ' + song);
};

var updateQueue = function() {
    $.ajax('/queue').done(function(data) {
        var newQueue = JSON.parse(data);
        $("#queue").empty();

        $.tmpl( "nowPlayingTemplate", newQueue[0]).appendTo("#queue");
        for (var i = 1; i < newQueue.length; i++) {
            $.tmpl( "queueTemplate", newQueue[i]).appendTo("#queue");
        }
    });
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
        + '<div class="arrows">'
        + '<div class="uparrow">'
        + '<span class="glyphicon glyphicon-thumbs-up" onclick="vote(\'${id}\', 1);"></span>'
        + '</div>'
        + '<div class="downarrow">'
        + '<span class="glyphicon glyphicon-thumbs-down" onclick="vote(\'${id}\', -1);"></span>'
        + '</div>'
        + '</div>'
        + '<div class="title">${title}</div>'
        + '<div class="artist">${artist}</div>'
        + '</li>';

    $.template( "nowPlayingTemplate", nowPlayingMarkup );

    var queueMarkup = '<li class="list-group-item" id="${id}">'
        + '<div class="arrows">'
        + '<div class="uparrow">'
        + '<span class="glyphicon glyphicon-thumbs-up" onclick="vote(\'${id}\', 1);"></span>'
        + '</div>'
        + '<div class="downarrow">'
        + '<span class="glyphicon glyphicon-thumbs-down" onclick="vote(\'${id}\', -1);"></span>'
        + '</div>'
        + '</div>'
        + '<div class="title">${title}</div>'
        + '<div class="artist">${artist}</div>'
        + '</li>';

    $.template( "queueTemplate", queueMarkup );

    var searchResultMarkup = '<li class="list-group-item searchResult" id="${id}" onclick="insertQueue(${self})">'
        + '<div class="title">${title}</div>'
        + '<div class="artist">${artist}</div>'
        + '</li>';

    $.template( "searchTemplate", searchResultMarkup );

    updateQueue();
});
