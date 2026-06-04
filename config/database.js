const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'water_monitor',
  user: 'postgres',
  password: 'postgres',
  max: 20,
  idleTimeoutMillis: 30000
});

module.exports = pool;
