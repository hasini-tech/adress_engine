const express = require('express');
const cors = require('cors');
require('dotenv').config();

const importRoutes = require('./routes/importRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// ✅ FIX: 500mb JSON body was loading entire file into RAM and crashing the process.
//    For large imports, use file upload (multipart) instead of JSON body.
//    Keep JSON body limit reasonable for smaller direct API calls (e.g. 10mb).


app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Routes
app.use('/api', importRoutes);

app.get('/', (req, res) => {
  res.json({
    message: 'Client Import API',
    endpoints: {
      import_json: 'POST /api/import  (body: { clients: [...] }, max ~10mb)',
      import_file: 'POST /api/import/file  (multipart JSON file upload, up to 500mb)',
      search:  'GET /api/clients/search?q=',
      clients: 'GET /api/clients'
    }
  });
});

app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ success: false, message: err.message });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}/api\n`);
});