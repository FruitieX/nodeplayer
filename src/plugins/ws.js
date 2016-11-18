'use strict';

import Plugin from '.';
import Sockjs from 'sockjs';
import _ from 'lodash';

const sockjsOpts = {
    sockjs_url: "http://cdn.jsdelivr.net/sockjs/1.0.1/sockjs.min.js"
};

export default class WebSockets extends Plugin {
  constructor(player, callback) {
    super();

    this.clients = {};

    const sockjs = Sockjs.createServer(sockjsOpts);

    sockjs.installHandlers(player.server.listener, {
      prefix: '/ws'
    });

    sockjs.on('connection', (conn) => {
      this.clients[conn.id] = conn;

      conn.write(JSON.stringify({
        jsonrpc: '2.0',
        method: 'sync',
        params: {
          nowPlaying: player.getNowPlaying(),
          queue: player.queue.serialize()
        }
      }));

      conn.on('close', () => {
        delete this.clients[conn.id];
      });
    });

    player.ws = sockjs;

    this.registerHook('onStartPlayback', (song) => {
      this.broadcast({
        jsonrpc: '2.0',
        method: 'play',
        params: song
      });
    });

    this.registerHook('onStopPlayback', (song) => {
      this.broadcast({
        jsonrpc: '2.0',
        method: 'stop',
        params: song
      });
    });

    this.registerHook('onQueueModify', (queue) => {
      this.broadcast({
        jsonrpc: '2.0',
        method: 'queue',
        params: queue
      });
    });

    callback();
  }

  broadcast(message) {
    // iterate through each client in clients object
    _.forOwn(this.clients, (client) => {
      // send the message to that client
      client.write(JSON.stringify(message));
    });
  }
}
