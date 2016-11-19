/*eslint-disable func-names*/
'use strict';

exports.up = function(knex) {
  return knex.schema
    .createTable('songs', function(table) {
      table.text('songId').primary();
      table.text('backendName').notNullable();
      table.integer('duration').notNullable();
      table.text('title').notNullable();
      table.text('artist');
      table.text('album');
      table.text('albumArt');
      table.timestamp('createdAt').defaultTo(knex.fn.now());
    })

    .then(function() {
    });
};

exports.down = function(knex) {
  return knex.schema
  .dropTableIfExists('songs');
};
