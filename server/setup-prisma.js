const mysql = require('mysql2/promise');
require('dotenv').config();

console.log('🔧 Setting up database...\n');

async function setupDatabase() {
  let connection;
  
  try {
    // Connect to MySQL
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      port: process.env.DB_PORT || 3306
    });

    console.log('✅ Connected to MySQL');
    
    // Create database
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\``);
    console.log(`✅ Database '${process.env.DB_NAME}' created/checked`);
    
    // Use the database
    await connection.query(`USE \`${process.env.DB_NAME}\``);
    
    // Create clients table
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_company (company),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ Created clients table');
    
    // Create import_logs table
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
    console.log('✅ Created import_logs table');
    
    console.log('\n🎉 Database setup completed successfully!');
    console.log('\n📊 Next steps:');
    console.log('   1. Start server: npm start');
    console.log('   2. Test API: http://localhost:5000/health');
    console.log('   3. Import data via POST http://localhost:5000/api/data/import');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    console.log('\n💡 Troubleshooting:');
    console.log('   1. Check if MySQL is running');
    console.log('   2. Verify username/password');
    console.log('   3. Try connecting manually:');
    console.log(`      mysql -u root -p${process.env.DB_PASSWORD || ''}`);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

setupDatabase();