const { PrismaClient } = require('@prisma/client');
const { resolveDatabaseUrl } = require('./databaseConfig');

const resolvedDatabaseUrl = resolveDatabaseUrl();

if (resolvedDatabaseUrl) {
  process.env.DATABASE_URL = resolvedDatabaseUrl;
}

const prisma = new PrismaClient({
  datasources: resolvedDatabaseUrl
    ? {
        db: {
          url: resolvedDatabaseUrl
        }
      }
    : undefined,
  log: ['warn', 'error'],
});

prisma.$connect()
  .then(() => {
    const url = resolvedDatabaseUrl || process.env.DATABASE_URL || '';
    const safeUrl = url.replace(/:(.*?)@/, ':****@');
    console.log(`Database connected (${safeUrl})`);
  })
  .catch((err) => {
    console.error('Database connection failed:', err.message);
    console.log('Run: npx prisma db push');
  });

module.exports = prisma;
