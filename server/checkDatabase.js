const mysql = require('mysql2/promise');
const {
  getConfiguredDatabaseName,
  getMysqlServerConnectionOptions
} = require('./lib/databaseConfig');

async function checkDatabase() {
  const databaseName = getConfiguredDatabaseName() || 'client_data';
  const connection = await mysql.createConnection(getMysqlServerConnectionOptions());

  try {
    console.log('Checking database structure...\n');

    const [dbs] = await connection.query('SHOW DATABASES');
    const dbExists = dbs.some((db) => db.Database === databaseName);

    if (!dbExists) {
      console.log('Database does not exist!');
      console.log('Run: mysql -u root -p < database_schema.sql');
      return;
    }

    await connection.query(`USE \`${databaseName}\``);

    const [tables] = await connection.query('SHOW TABLES');

    if (tables.length === 0) {
      console.log('No tables found in database!');
      console.log('Tables need to be created.');
    } else {
      console.log('Database and tables exist!\n');
      console.log('Found tables:');
      tables.forEach((table, index) => {
        const tableName = Object.values(table)[0];
        console.log(`   ${index + 1}. ${tableName}`);
      });

      console.log('\nTable structures:');
      for (const table of tables) {
        const tableName = Object.values(table)[0];
        console.log(`\n--- ${tableName} ---`);
        const [columns] = await connection.query(`DESCRIBE ${tableName}`);
        columns.forEach((col) => {
          console.log(`  ${col.Field} (${col.Type}) ${col.Null === 'NO' ? 'NOT NULL' : ''}`);
        });
      }
    }
  } catch (error) {
    console.error('Error checking database:', error.message);
  } finally {
    await connection.end();
  }
}

checkDatabase();
