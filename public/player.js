var socket = io();
socket.on('playback', function(data) {
    $("#audio").append('<source src="/song/' + data.songID + '">');
    if(data.position) {
        var audio = document.getElementById('audio');

        audio.addEventListener('canplaythrough', function() {
            audio.currentTime = data.position / 1000;
        }, false);
    }
    console.log(data);
});
