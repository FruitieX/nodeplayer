var config = {};

config.backendServices = ['dummy', 'gmusic'];

config.songCachePath = process.env.HOME + '/.partyplay/songCache';
config.searchResultCnt = 10;
config.badVotePercent = 0.67;
config.songDelayMs = 1000;
config.log = true;

// supports IPs, CIDR subnets, ranges
config.streamIPs = ['127.0.0.1', '192.168.0.0/24', ['10.8.0.0', '10.8.0.10']]

module.exports = config;
