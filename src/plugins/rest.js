'use strict';

const _ = require('lodash');

const async = require('async');
const path = require('path');
import Plugin from '.';
import Boom from 'boom';
import Inert from 'inert';

export default class Rest extends Plugin {
  constructor(player, callback) {
    super();

    if (!player.server) {
      return callback('module must be initialized after Server module!');
    }

    this.pendingRequests = {};

    player.server.register(Inert);

    player.server.route({
      method: 'GET',
      path: '/api/v1',
      handler: (request, reply) => {
        reply('Hello world!\n');
      }
    });

    player.server.route({
      method: 'GET',
      path: '/api/v1/queue',
      handler: (request, reply) => {
        reply(player.getQueue());
      }
    });

    player.server.route({
      method: 'GET',
      path: '/api/v1/state',
      handler: (request, reply) => {
        reply(player.getState());
      }
    });

    player.server.route({
      method: 'POST',
      path: '/api/v1/search',
      handler: (request, reply) => {
        this.log.verbose('got search request: ' + JSON.stringify(request.payload));

        player.searchBackends(request.payload, (err, results) => {
          // console.log(results);
          reply(results);
        });
      }
    });

    player.server.route({
      method: 'POST',
      path: '/api/v1/queue/song',
      handler: (request, reply) => {
        this.log.verbose('got search request: ' + JSON.stringify(request.payload));

        const err = player.queue.insertSongs(null, request.payload);
        reply(err ? Boom.badImplementation(err) : { success: true });
      }
    });

    this.registerHook('onPrepareProgress', (song, bytesWritten, done) => {
      if (!this.pendingRequests[song.backend.name]) {
        return;
      }

      _.each(this.pendingRequests[song.backend.name][song.songId], client => {
        if (bytesWritten) {
          let end = song.prepare.dataPos;
          if (client.wishRange[1]) {
            end = Math.min(client.wishRange[1], bytesWritten - 1);
          }

          // console.log('end: ' + end + '\tclient.serveRange[1]: ' + client.serveRange[1]);

          if (client.serveRange[1] < end) {
            // console.log('write');
            client.res.write(song.prepare.data.slice(client.serveRange[1] + 1, end));
          }

          client.serveRange[1] = end;
        }

        if (done) {
          this.log.debug('done');
          client.res.end();
        }
      });

      if (done) {
        this.pendingRequests[song.backend.name][song.songId] = [];
      }
    });

    this.registerHook('onBackendInitialized', backendName => {
      this.pendingRequests[backendName] = {};

      // provide API path for music data, might block while song is preparing
      player.server.route({
        method: 'GET',
        path: `/api/v1/song/${backendName}/{fileName}`,
        handler: (request, reply) => {
          const extIndex = request.params.fileName.lastIndexOf('.');
          const songId = request.params.fileName.substring(0, extIndex);
          const songFormat = request.params.fileName.substring(extIndex + 1);

          const backend = player.backends[backendName];
          const filename = path.join(backendName, songId + '.' + songFormat);

          //const response = reply();

          //res.setHeader('Content-Type', 'audio/ogg; codecs=opus');
          //res.setHeader('Accept-Ranges', 'bytes');
          //response.header('Content-Type', 'audio/ogg; codecs=opus');
          //response.header('Accept-Ranges', 'audio/ogg; codecs=opus');
          //
          const setHeaders = (response) => {
            return response.header('Content-Type', 'audio/ogg; codecs=opus');
          };

          const queuedSong = _.find(player.queue.serialize(), song => {
            return song.songId === songId && song.backendName === backendName;
          });

          if (backend.isPrepared({ songId: songId })) {
            // song should be available on disk
            const response = reply.file(filename, {
              confine: this.coreConfig.songCachePath,
            });

            setHeaders(response);
          } else if (backend.songsPreparing[songId]) {
            reply(Boom.notImplemented('TODO: Fetching in-progress songs not yet supported'));
          } else {
            reply(Boom.notFound('Song not found'));
          }
          /*
          async.series([
            callback => {
              // try finding out length of song
              if (queuedSong) {
                //res.setHeader('X-Content-Duration', queuedSong.duration / 1000);
                response.header('X-Content-Duration', queuedSong.duration / 1000);
                callback();
              } else {
                backend.getDuration({ songId: songId }, (err, exactDuration) => {
                  //res.setHeader('X-Content-Duration', exactDuration / 1000);
                  response.header('X-Content-Duration', exactDuration / 1000);
                  callback();
                });
              }
            },
            callback => {
              if (backend.isPrepared({ songId: songId })) {
                // song should be available on disk
                response.file(filename, {
                  confine: this.coreConfig.songCachePath,
                });
              } else if (backend.songsPreparing[songId]) {
                response(Boom.notImplemented('TODO: Fetching in-progress songs not yet supported'));
                /*
                // song is preparing
                const song = backend.songsPreparing[songId];

                const haveRange = [];
                let wishRange = [];
                const serveRange = [];

                haveRange[0] = 0;
                haveRange[1] = song.prepare.data.length - 1;

                wishRange[0] = 0;
                wishRange[1] = null;

                serveRange[0] = 0;

                res.setHeader('Transfer-Encoding', 'chunked');

                if (request.headers.range) {
                  // partial request

                  wishRange = request.headers.range.substr(request.headers.range.indexOf('=') + 1).split('-');

                  serveRange[0] = wishRange[0];

                  // a best guess for the response header
                  serveRange[1] = haveRange[1];
                  if (wishRange[1]) {
                    serveRange[1] = Math.min(wishRange[1], haveRange[1]);
                  }

                  res.statusCode = 206;
                  res.setHeader('Content-Range', 'bytes ' + serveRange[0] + '-' + serveRange[1] + '/*');
                } else {
                  serveRange[1] = haveRange[1];
                }

                this.log.debug('request with wishRange: ' + wishRange);

                if (!this.pendingRequests[backendName][songId]) {
                  this.pendingRequests[backendName][songId] = [];
                }

                const client = {
                  res:        res,
                  serveRange: serveRange,
                  wishRange:  wishRange,
                  filepath:   path.join(config.songCachePath, filename),
                };

                // TODO: If we know that we have already flushed data to disk,
                // we could open up the read stream already here instead of waiting
                // around for the first flush

                // If we can satisfy the start of the requested range, write as
                // much as possible to res immediately
                if (haveRange[1] >= wishRange[0]) {
                  client.res.write(song.prepare.data.slice(serveRange[0], serveRange[1] + 1));
                }

                if (serveRange[1] === wishRange[1]) {
                  client.res.end();
                } else {
                  // If we couldn't satisfy the entire request, push the client
                  // into pendingRequests so we can append to the stream later
                  this.pendingRequests[backendName][songId].push(client);

                  request.on('close', () => {
                    this.pendingRequests[backendName][songId].splice(
                                          this.pendingRequests[backendName][songId].indexOf(client), 1
                                      );
                  });
                }
              } else {
                response(Boom.notFound('Song not found'));
              }
            }]
          );
          */
        }
      });
    });

    callback();

      /*
    player.app.use((req, res, next) => {
      res.sendRes = (err, data) => {
        if (err) {
          res.status(404).send(err);
        } else {
          res.send(data || 'ok');
        }
      };
      next();
    });

    player.app.get('/queue', (req, res) => {
      const np = player.nowPlaying;
      let pos = 0;
      if (np) {
        if (np.playback.startTime) {
          pos = new Date().getTime() - np.playback.startTime + np.playback.startPos;
        } else {
          pos = np.playback.startPos;
        }
      }

      res.json({
        songs:         player.queue.serialize(),
        nowPlaying:    np ? np.serialize() : null,
        nowPlayingPos: pos,
        play:          player.play,
      });
    });

    // TODO: error handling
    player.app.post('/queue/song', (req, res) => {
      const err = player.queue.insertSongs(null, req.body);

      res.sendRes(err);
    });
    player.app.post('/queue/song/:at', (req, res) => {
      const err = player.queue.insertSongs(req.params.at, req.body);

      res.sendRes(err);
    });

    */
    /*
    player.app.post('/queue/move/:pos', (req, res) => {
        var err = player.moveInQueue(
            Number(req.params.pos),
            Number(req.body.to),
            Number(req.body.cnt)
        );
        sendResponse(res, 'success', err);
    });
    */

    /*
    player.app.delete('/queue/song/:at', (req, res) => {
      player.removeSongs(req.params.at, Number(req.query.cnt) || 1, res.sendRes);
    });

    player.app.post('/playctl/play', (req, res) => {
      player.startPlayback(Number(req.body.position) || 0);
      res.sendRes(null, 'ok');
    });

    player.app.post('/playctl/stop', (req, res) => {
      player.stopPlayback(req.query.pause);
      res.sendRes(null, 'ok');
    });

    player.app.post('/playctl/skip', (req, res) => {
      player.skipSongs(Number(req.body.cnt));
      res.sendRes(null, 'ok');
    });

    player.app.post('/playctl/shuffle', (req, res) => {
      player.shuffleQueue();
      res.sendRes(null, 'ok');
    });

    player.app.post('/volume', (req, res) => {
      player.setVolume(Number(req.body));
      res.send('success');
    });

    // search for songs, search terms in query params
    player.app.post('/search', (req, res) => {
      this.log.verbose('got search request: ' + JSON.stringify(req.body));

      player.searchBackends(req.body, (err, results) => {
        // console.log(results);
        res.json(results);
      });
    });

    this.pendingRequests = {};
    const rest = this;
    this.registerHook('onPrepareProgress', (song, bytesWritten, done) => {
      if (!rest.pendingRequests[song.backend.name]) {
        return;
      }

      _.each(rest.pendingRequests[song.backend.name][song.songId], client => {
        if (bytesWritten) {
          let end = song.prepare.dataPos;
          if (client.wishRange[1]) {
            end = Math.min(client.wishRange[1], bytesWritten - 1);
          }

          // console.log('end: ' + end + '\tclient.serveRange[1]: ' + client.serveRange[1]);

          if (client.serveRange[1] < end) {
            // console.log('write');
            client.res.write(song.prepare.data.slice(client.serveRange[1] + 1, end));
          }

          client.serveRange[1] = end;
        }

        if (done) {
          this.log.debug('done');
          client.res.end();
        }
      });

      if (done) {
        rest.pendingRequests[song.backend.name][song.songId] = [];
      }
    });

    this.registerHook('onBackendInitialized', backendName => {
      rest.pendingRequests[backendName] = {};

      // provide API path for music data, might block while song is preparing
      player.app.get('/song/' + backendName + '/:fileName', (req, res, next) => {
        const extIndex = req.params.fileName.lastIndexOf('.');
        const songId = req.params.fileName.substring(0, extIndex);
        const songFormat = req.params.fileName.substring(extIndex + 1);

        const backend = player.backends[backendName];
        const filename = path.join(backendName, songId + '.' + songFormat);

        res.setHeader('Content-Type', 'audio/ogg; codecs=opus');
        res.setHeader('Accept-Ranges', 'bytes');

        const queuedSong = _.find(player.queue.serialize(), song => {
          return song.songId === songId && song.backendName === backendName;
        });

        async.series([
          callback => {
            // try finding out length of song
            if (queuedSong) {
              res.setHeader('X-Content-Duration', queuedSong.duration / 1000);
              callback();
            } else {
              backend.getDuration({ songId: songId }, (err, exactDuration) => {
                res.setHeader('X-Content-Duration', exactDuration / 1000);
                callback();
              });
            }
          },
          callback => {
            if (backend.isPrepared({ songId: songId })) {
              // song should be available on disk
              res.sendFile(filename, {
                root: config.songCachePath,
              });
            } else if (backend.songsPreparing[songId]) {
              // song is preparing
              const song = backend.songsPreparing[songId];

              const haveRange = [];
              let wishRange = [];
              const serveRange = [];

              haveRange[0] = 0;
              haveRange[1] = song.prepare.data.length - 1;

              wishRange[0] = 0;
              wishRange[1] = null;

              serveRange[0] = 0;

              res.setHeader('Transfer-Encoding', 'chunked');

              if (req.headers.range) {
                // partial request

                wishRange = req.headers.range.substr(req.headers.range.indexOf('=') + 1).split('-');

                serveRange[0] = wishRange[0];

                // a best guess for the response header
                serveRange[1] = haveRange[1];
                if (wishRange[1]) {
                  serveRange[1] = Math.min(wishRange[1], haveRange[1]);
                }

                res.statusCode = 206;
                res.setHeader('Content-Range', 'bytes ' + serveRange[0] + '-' + serveRange[1] + '/*');
              } else {
                serveRange[1] = haveRange[1];
              }

              this.log.debug('request with wishRange: ' + wishRange);

              if (!rest.pendingRequests[backendName][songId]) {
                rest.pendingRequests[backendName][songId] = [];
              }

              const client = {
                res:        res,
                serveRange: serveRange,
                wishRange:  wishRange,
                filepath:   path.join(config.songCachePath, filename),
              };

              // TODO: If we know that we have already flushed data to disk,
              // we could open up the read stream already here instead of waiting
              // around for the first flush

              // If we can satisfy the start of the requested range, write as
              // much as possible to res immediately
              if (haveRange[1] >= wishRange[0]) {
                client.res.write(song.prepare.data.slice(serveRange[0], serveRange[1] + 1));
              }

              if (serveRange[1] === wishRange[1]) {
                client.res.end();
              } else {
                // If we couldn't satisfy the entire request, push the client
                // into pendingRequests so we can append to the stream later
                rest.pendingRequests[backendName][songId].push(client);

                req.on('close', () => {
                  rest.pendingRequests[backendName][songId].splice(
                                        rest.pendingRequests[backendName][songId].indexOf(client), 1
                                    );
                });
              }
            } else {
              res.status(404).end('404 song not found');
            }
          }]
        );
      });
    });

    callback(null);
    */
  }
}
