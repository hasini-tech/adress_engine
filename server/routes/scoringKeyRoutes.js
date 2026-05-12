const express = require('express');
const controller = require('../controllers/scoringKeyController');

const router = express.Router();

router.get('/api-keys', controller.listScoringKeys);
router.post('/api-keys', controller.createScoringKey);
router.delete('/api-keys/:id', controller.deleteScoringKey);

module.exports = router;
