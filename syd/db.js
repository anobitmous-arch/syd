'use strict';
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.SYD_DATABASE_URL,
});

module.exports = pool;
