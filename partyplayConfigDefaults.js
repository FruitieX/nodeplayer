var config = {};

// backends are sources of music
config.backends = ['youtube', 'gmusic'];

// plugins are "everything else", most of the functionality is in plugins
//
// NOTE: ordering is important here, plugins that depend on other plugins will
// complain if order is wrong
config.plugins = ['expressjs', 'rest', 'ipfilter', 'socketio', 'partyplay'];

config.songCachePath = process.env.HOME + '/.partyplay/songCache';
config.searchResultCnt = 10;
//config.badVotePercent = 0.67;
config.badVotePercent = 0.51;
config.songDelayMs = 1000; // add delay between songs to prevent skips
config.songMaxDuration = 8 * 60 * 1000; // max allowed song duration
config.log = true;

// IP filter for listener
config.filterStreamIPs = ['10.8.0.0/24', '127.0.0.1'];
// is the above a blacklist (deny) or whitelist (allow)?
config.filterAction = 'allow';

module.exports = config;
