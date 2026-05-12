const express = require('express');
const router  = express.Router();
const upload  = require('../middleware/upload');
const controller = require('../controllers/importController');
const integrationController = require('../controllers/integrationController');
const apiKeyAuth = require('../middleware/apiKeyAuth');

// JSON body import (≤ 10mb, ~50k small records)
router.post('/import', controller.importClients);

// File upload import (up to 500mb, millions of records — streams to avoid OOM)
router.post('/import/file', upload.single('file'), controller.importFile);

// Client endpoints
router.get('/clients',        controller.getClients);
router.get('/clients/search', controller.search);
router.get('/checkout/lookup', apiKeyAuth, integrationController.checkoutLookup);

// Admin
router.get('/imports', controller.getImportHistory);
router.get('/stats',   controller.getStats);

module.exports = router;
