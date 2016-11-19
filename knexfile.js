//This file is interpreted as ES5 CommonJS module.
'use strict';

const getConfig = require('./src/config').getConfig;

const ALL_ENVIRONMENTS = Object.assign(getConfig().db, {
  pool: {
    min: 1,
    max: 1
  },
  migrations: {
    tableName: 'nodeplayer_migrations',
    directory: 'db/migrations'
  }
});

// Feel free to create any number of other environments.
// The ones below are a best attempt at sensible defaults.
module.exports = {
  // Developer's local machine
  development: ALL_ENVIRONMENTS,
  // Unit and integration test environment
  test: ALL_ENVIRONMENTS,
  // Shared test/qa/staging/preproduction
  staging: ALL_ENVIRONMENTS,
  // Production environment
  production: ALL_ENVIRONMENTS
};
