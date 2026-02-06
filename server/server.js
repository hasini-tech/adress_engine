const express = require('express');
const cors = require('cors');
require('dotenv').config();

const importRoutes = require('./routes/importRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));

// Routes
app.use('/api', importRoutes);

// Root
app.get('/', (req, res) => {
  res.json({ 
    message: 'Client Import API',
    endpoints: {
      import: 'POST /api/import',
      search: 'GET /api/clients/search?q=',
      clients: 'GET /api/clients'
    }
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ success: false, message: err.message });
});

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║  🚀 Server running on port ${PORT}        ║
║  API: http://localhost:${PORT}/api        ║
╚════════════════════════════════════════╝
  `);
});