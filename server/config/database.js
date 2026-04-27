const mysql = require('mysql2/promise');
const { getConfiguredDatabaseName, getMysqlPoolOptions } = require('../lib/databaseConfig');

const poolOptions = getMysqlPoolOptions();

console.log('Connecting to MySQL...');
console.log(`   Database: ${getConfiguredDatabaseName()}`);
console.log(`   Host: ${poolOptions.host}`);

const pool = mysql.createPool(poolOptions);

// Test connection
pool.getConnection()
  .then((connection) => {
    console.log('Database connected successfully');
    connection.release();
  })
  .catch((error) => {
    console.error('Database connection failed:', error.message);
    console.log('\nRun: npm run setup-db');
  });

module.exports = pool;
