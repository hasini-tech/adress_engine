const express = require('express');
const cors = require('cors');
require('dotenv').config();

const importRoutes = require('./routes/importRoutes');
const { getConfiguredDatabaseName } = require('./lib/databaseConfig');
const prisma = require('./lib/prisma');

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '127.0.0.1';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use('/api', importRoutes);

app.get('/', (req, res) => {
  res.json({
    message: 'Client Import API',
    endpoints: {
      import_json: 'POST /api/import  (body: { clients: [...] }, max ~10mb)',
      import_file: 'POST /api/import/file  (multipart JSON file upload, up to 500mb)',
      search: 'GET /api/clients/search?q=',
      clients: 'GET /api/clients'
    }
  });
});

app.get('/health', async (req, res) => {
  try {
    const currentDatabase = await prisma.$queryRawUnsafe('SELECT DATABASE() AS db');
    res.json({
      status: 'ok',
      database: currentDatabase?.[0]?.db || null,
      configuredDbName: getConfiguredDatabaseName(),
      port: PORT
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ success: false, message: err.message });
});

const server = app.listen(PORT, HOST, () => {
  const publicHost = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log(`Server running on http://${publicHost}:${PORT}/api`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
    console.error(`A server may already be running on http://localhost:${PORT}.`);
    console.error('Stop the existing process or change PORT in .env before starting again.');
  } else {
    console.error('Server failed to start:', error.message);
  }

  process.exit(1);
});

let isShuttingDown = false;

const shutdown = (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`${signal} received. Shutting down server...`);

  const forceShutdownTimer = setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);

  forceShutdownTimer.unref();

  server.close(async () => {
    clearTimeout(forceShutdownTimer);

    try {
      await prisma.$disconnect();
    } catch (error) {
      console.error('Error while disconnecting Prisma:', error.message);
    }

    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
