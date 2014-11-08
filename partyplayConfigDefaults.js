var config = {};

config.backendServices = ['dummy', 'gmusic'];

config.songCachePath = process.env.HOME + '/.partyplay/songCache';
config.searchResultCnt = 10;
config.badVotePercent = 0.67;
config.songDelayMs = 1000;
config.log = true;

// list of IP addresses in CIDR format that are allowed to stream music
config.streamIPs = ['10.8.0.1/24', '127.0.0.1/32']

module.exports = config;
