var config = {};

// Default partyplay config
//
// These variables can be overridden by writing the variables you
// wish to override into ~/.partyplayConfig.js
//
// Use the same structure, a config object which contains config variables
// as properties. Export the object at the bottom of the file.

// backends are sources of music
config.backends = ['youtube', 'gmusic'];

// plugins are "everything else", most of the functionality is in plugins
//
// NOTE: ordering is important here, plugins that depend on other plugins will
// complain if order is wrong
config.plugins = ['https', 'rest', 'ipfilter', 'socketio', 'partyplay'];

config.hostname = 'https://mydomain.com';
config.port = 8080;

// TLS options
// By default we use the same TLS key/cert as CA, and on clients/server. We use
// TLS client authentication for restricting access to authorized clients.
// You may want to disable it if you want public access to parts of your server.
config.tls = true;
config.tlsKey = process.env.HOME + '/.partyplay/partyplay-key.pem';
config.tlsCert = process.env.HOME + '/.partyplay/partyplay-cert.pem';
config.tlsCa = process.env.HOME + '/.partyplay/partyplay-cert.pem';
config.requestCert = true; // TLS client authentication
config.rejectUnauthorized = true; // Disabling leaves you vulnerable to MITM

config.verifyMac = {};
config.verifyMac.algorithm = 'sha256';
config.verifyMac.key = process.env.HOME + '/.partyplay/partyplay-key.pem';
config.verifyMac.iterations = 1000;
config.verifyMac.keyLen = 256;

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
