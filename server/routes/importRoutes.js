const express = require('express');
const router = express.Router();
const controller = require('../controllers/importController');

// Import endpoint
router.post('/import', controller.importClients);

// Client endpoints
router.get('/clients', controller.getClients);
router.get('/clients/search', controller.search);

// Admin endpoints
router.get('/imports', controller.getImportHistory);
router.get('/stats', controller.getStats);

module.exports = router;