var config = {};

config.backendServices = ['dummy', 'gmusic'];

config.songCachePath = process.env.HOME + '/.partyplay/songCache';
config.searchResultCnt = 10;
config.badVotePercent = 0.67;
config.songDelayMs = 1000;
config.log = true;

// IP filter for listener
config.filterStreamIPs = ['10.8.0.0/24', '127.0.0.1'];
// is the above a blacklist (deny) or whitelist (allow)?
config.filterAction = 'allow';

module.exports = config;
