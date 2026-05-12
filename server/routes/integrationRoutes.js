const express = require('express');
const controller = require('../controllers/integrationController');
const apiKeyAuth = require('../middleware/apiKeyAuth');

const router = express.Router();

router.get('/api-keys', controller.listApiKeys);
router.post('/api-keys', controller.createApiKey);
router.patch('/api-keys/:id', controller.updateApiKey);
router.delete('/api-keys/:id', controller.deleteApiKey);

router.get('/checkout/lookup', apiKeyAuth, controller.checkoutLookup);

module.exports = router;
