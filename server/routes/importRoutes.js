const express = require('express');
const router = express.Router();
const controller = require('../controllers/importController');

// Debug check to ensure controller is loaded
if (!controller.importClients || !controller.search) {
    console.error("❌ CRITICAL ERROR: Controller functions not found!");
    console.error("   Make sure importController.js is exporting 'importClients' and 'search'");
    process.exit(1); // Stop server if controller is broken
}

// Route definitions
router.post('/import', controller.importClients);
router.get('/clients/search', controller.search);

module.exports = router;