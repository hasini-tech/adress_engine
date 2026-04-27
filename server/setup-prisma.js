const mysql = require('mysql2/promise');
const {
  getConfiguredDatabaseName,
  getMysqlServerConnectionOptions
} = require('./lib/databaseConfig');

console.log('Setting up database...\n');

async function setupDatabase() {
  let connection;
  const databaseName = getConfiguredDatabaseName() || 'client_data';

  try {
    connection = await mysql.createConnection(getMysqlServerConnectionOptions());

    console.log('Connected to MySQL');

    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\``);
    console.log(`Database '${databaseName}' created/checked`);

    await connection.query(`USE \`${databaseName}\``);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id INT PRIMARY KEY AUTO_INCREMENT,
        client_id VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        company VARCHAR(255),
        address TEXT,
        city VARCHAR(100),
        state VARCHAR(100),
        country VARCHAR(100),
        postal_code VARCHAR(50),
        quality_score INT NULL,
        quality_band VARCHAR(50) NULL,
        metadata JSON NULL,
        is_active BOOLEAN DEFAULT TRUE,
        import_id VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_company (company),
        INDEX idx_created_at (created_at),
        INDEX idx_import_id (import_id),
        INDEX idx_quality_band (quality_band)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('Created clients table');

    const clientColumnUpgrades = [
      'ALTER TABLE clients ADD COLUMN quality_score INT NULL',
      'ALTER TABLE clients ADD COLUMN quality_band VARCHAR(50) NULL',
      'ALTER TABLE clients ADD COLUMN metadata JSON NULL',
      'ALTER TABLE clients ADD COLUMN is_active BOOLEAN DEFAULT TRUE',
      'ALTER TABLE clients ADD COLUMN import_id VARCHAR(100)',
      'ALTER TABLE clients ADD INDEX idx_import_id (import_id)',
      'ALTER TABLE clients ADD INDEX idx_quality_band (quality_band)'
    ];

    for (const statement of clientColumnUpgrades) {
      try {
        await connection.query(statement);
      } catch (error) {
        if (!String(error.message).toLowerCase().includes('duplicate')) {
          throw error;
        }
      }
    }
    console.log('Ensured client score columns exist');

    await connection.query(`
      CREATE TABLE IF NOT EXISTS import_logs (
        id INT PRIMARY KEY AUTO_INCREMENT,
        import_id VARCHAR(100) UNIQUE NOT NULL,
        file_name VARCHAR(255),
        total_records INT DEFAULT 0,
        inserted_records INT DEFAULT 0,
        updated_records INT DEFAULT 0,
        failed_records INT DEFAULT 0,
        status VARCHAR(20) DEFAULT 'pending',
        error_message TEXT,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP NULL,
        INDEX idx_status (status),
        INDEX idx_started_at (started_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('Created import_logs table');

    console.log('\nDatabase setup completed successfully!');
    console.log('\nNext steps:');
    console.log('   1. Start server: npm start');
    console.log('   2. Test API: http://localhost:5000/health');
    console.log('   3. Import data via POST http://localhost:5000/api/data/import');
  } catch (error) {
    console.error('Database setup failed:', error.message);
    console.log('\nTroubleshooting:');
    console.log('   1. Check if MySQL is running');
    console.log('   2. Verify username/password');
    console.log('   3. Try connecting manually:');
    console.log(`      mysql -u root -p${getMysqlServerConnectionOptions().password || ''}`);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

setupDatabase();
