const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const importRoutes = require('./routes/importRoutes');

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());

// IMPORTANT: Increase payload limit for large JSON files
app.use(express.json({ limit: '200mb' })); 
app.use(express.urlencoded({ limit: '200mb', extended: true }));

// Routes
app.use('/api', importRoutes);

// Health Check
app.get('/', (req, res) => res.send('Address Engine API Running'));

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});