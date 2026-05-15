const express = require('express');
const controller = require('../controllers/scoringKeyController');

const router = express.Router();

router.get('/api-keys', controller.listScoringKeys);
router.post('/api-keys', controller.createScoringKey);
router.get('/api-keys/:id', controller.getScoringKeyDetail);
router.delete('/api-keys/:id', controller.deleteScoringKey);
router.post('/api-keys/:id/fetch-customers', controller.fetchCustomers);
router.post('/api-keys/:id/score-customers', controller.scoreCustomers);
router.post('/api-keys/:id/fetch-score', controller.fetchAndScoreCustomers);
router.get('/api-keys/:id/customers', controller.listCustomers);

module.exports = router;
