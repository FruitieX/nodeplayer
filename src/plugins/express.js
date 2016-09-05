'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const https = require('https');
const http = require('http');
const fs = require('fs');

import Plugin from '../plugin';

export default class Express extends Plugin {
  constructor(player, callback) {
    super();

    // NOTE: no argument passed so we get the core's config
    const config = require('../config').getConfig();
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
    this.log.info('listening on port ' + port);

    player.app.use(cookieParser());
    player.app.use(bodyParser.json({ limit: '100mb' }));
    player.app.use(bodyParser.urlencoded({ extended: true }));

    callback(null, this);
  }
}
