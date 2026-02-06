const mysql = require('mysql2/promise');
require('dotenv').config();

console.log('🔌 Connecting to MySQL...');
console.log(`   Database: ${process.env.DB_NAME}`);
console.log(`   Host: ${process.env.DB_HOST}`);

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'client_data',
  port: process.env.DB_PORT || 3306,
  
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test connection
pool.getConnection()
  .then(connection => {
    console.log('✅ Database connected successfully');
    connection.release();
  })
  .catch(error => {
    console.error('❌ Database connection failed:', error.message);
    console.log('\n💡 Run: npm run setup-db');
  });

module.exports = pool;