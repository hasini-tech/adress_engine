const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkDatabase() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'client_data'
  });

  try {
    console.log('🔍 Checking database structure...\n');
    
    // Check if database exists
    const [dbs] = await connection.query('SHOW DATABASES');
    const dbExists = dbs.some(db => db.Database === (process.env.DB_NAME || 'client_data'));
    
    if (!dbExists) {
      console.log('❌ Database does not exist!');
      console.log('💡 Run: mysql -u root -p < database_schema.sql');
      return;
    }

    // Check tables
    const [tables] = await connection.query('SHOW TABLES');
    
    if (tables.length === 0) {
      console.log('❌ No tables found in database!');
      console.log('💡 Tables need to be created.');
    } else {
      console.log('✅ Database and tables exist!\n');
      console.log('📋 Found tables:');
      tables.forEach((table, index) => {
        const tableName = Object.values(table)[0];
        console.log(`   ${index + 1}. ${tableName}`);
      });
      
      // Show table structure
      console.log('\n📊 Table structures:');
      for (const table of tables) {
        const tableName = Object.values(table)[0];
        console.log(`\n--- ${tableName} ---`);
        const [columns] = await connection.query(`DESCRIBE ${tableName}`);
        columns.forEach(col => {
          console.log(`  ${col.Field} (${col.Type}) ${col.Null === 'NO' ? 'NOT NULL' : ''}`);
        });
      }
    }
  } catch (error) {
    console.error('❌ Error checking database:', error.message);
  } finally {
    await connection.end();
  }
}

checkDatabase();