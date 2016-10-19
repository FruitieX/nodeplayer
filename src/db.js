'use strict';

import { getConfig } from './config';
import knex from 'knex';

export default knex({
  client:     getConfig().db.client,
  connection: getConfig().db.connection,
});
