'use strict';

import Plugin from '.';
import Song from '../song';
import fs from 'fs';

export default class StoreQueue extends Plugin {
  constructor(player, callback) {
    super();

    this.path = this.coreConfig.queueStorePath;
    this.initialized = false;
    this.player = player;

    this.registerHook('onQueueModify', () => {
      if (!this.path || !this.initialized) {
        return;
      }

      this.storeQueue();
    });

    this.registerHook('onStartPlayback', () => {
      if (!this.path || !this.initialized) {
        return;
      }

      this.storeQueue();
    });

    this.registerHook('onBackendsInitialized', (backends) => {
      if (this.path && fs.existsSync(this.path)) {
        fs.readFile(this.path, (err, data) => {
          if (!err) {
            data = JSON.parse(data);

            const queue = data.queue;
            player.queue.insertSongs(null, queue);

            let np = data.nowPlaying;
            if (np) {
              np = new Song(np, backends[np.backendName]);
              player.nowPlaying = np;
              player.startPlayback(data.nowPlaying.playback.curPos);
            }

            process.once('SIGINT', () => {
              console.log('SIGINT received, saving queue');
              this.storeQueue(true);
            });
            process.once('SIGUSR2', () => {
              console.log('SIGUSR2 received, saving queue');
              this.storeQueue(true);
            });

            this.initialized = true;
          }
        });
      }
    });

    callback();
  }

  storeQueue(quit) {
    let np = this.player.nowPlaying ? this.player.nowPlaying.serialize() : null;

    if (np) {
      np.playback.startPos = np.playback.curPos;
    }

    fs.writeFile(this.path, JSON.stringify({
      queue: this.player.queue.serialize(),
      nowPlaying: np
    }, '', 4), () => {
      if (quit) {
        process.exit(0);
      }
    });
  }
}
