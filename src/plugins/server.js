'use strict';

import Plugin from '.';

import Hapi from 'hapi';
//const bodyParser = require('body-parser');
//const cookieParser = require('cookie-parser');
//const https = require('https');
//const http = require('http');
//const fs = require('fs');

export default class Server extends Plugin {
  constructor(player, callback) {
    super();

    const server = new Hapi.Server();
    server.connection({
      port: this.coreConfig.port,
      routes: {
        cors: true
      }
    });

    server.start(err => {
      if (err) {
        return callback(err);
      } else {
        this.log.info(`listening on port ${this.coreConfig.port}`);
        player.server = server;

        callback();
      }
    });

    /*
    // NOTE: no argument passed so we get the core's config
    player.app = express();

    let options = {};
    const port = process.env.PORT || config.port;
    if (config.tls) {
      options = {
        tls:                config.tls,
        key:                config.key ? fs.readFileSync(config.key) : undefined,
        cert:               config.cert ? fs.readFileSync(config.cert) : undefined,
        ca:                 config.ca ? fs.readFileSync(config.ca) : undefined,
        requestCert:        config.requestCert,
        rejectUnauthorized: config.rejectUnauthorized,
      };
      // TODO: deprecated!
      player.app.set('tls', true);
      player.httpServer = https.createServer(options, player.app)
                    .listen(port);
    } else {
      player.httpServer = http.createServer(player.app)
                    .listen(port);
    }

    player.app.use(cookieParser());
    player.app.use(bodyParser.json({ limit: '100mb' }));
    player.app.use(bodyParser.urlencoded({ extended: true }));
    */
  }
}
