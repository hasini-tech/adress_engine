const { PrismaClient } = require('@prisma/client');

// If DB_* vars are set, build DATABASE_URL from them so Prisma and MySQL tools
// always point to the exact same instance.
const buildDatabaseUrlFromEnv = () => {
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const name = process.env.DB_NAME;
  if (!host || !user || !name) return null;

  const password = process.env.DB_PASSWORD || '';
  const port = process.env.DB_PORT || '3306';
  const db = String(name).trim();
  const encodedUser = encodeURIComponent(user);
  const encodedPass = encodeURIComponent(password);
  const auth = password ? `${encodedUser}:${encodedPass}` : encodedUser;
  return `mysql://${auth}@${host}:${port}/${db}?connection_limit=5`;
};

const inferredUrl = buildDatabaseUrlFromEnv();
if (inferredUrl) {
  process.env.DATABASE_URL = inferredUrl;
}

const prisma = new PrismaClient({
  log: ['warn', 'error'],
});

prisma.$connect()
  .then(() => {
    const url = process.env.DATABASE_URL || '';
    const safeUrl = url.replace(/:(.*?)@/, ':****@');
    console.log(`âœ… Database connected (${safeUrl})`);
  })
  .catch((err) => {
    console.error('âŒ Database connection failed:', err.message);
    console.log('ðŸ’¡ Run: npx prisma db push');
  });

module.exports = prisma;
