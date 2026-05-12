const scoringKeyStore = require('../services/scoringKeyStore');

const listScoringKeys = (req, res) => {
  res.json({
    success: true,
    data: scoringKeyStore.listKeys()
  });
};

const createScoringKey = (req, res) => {
  try {
    const { api_key: apiKey, label, platform } = req.body || {};

    const record = scoringKeyStore.createKey({
      apiKey,
      label,
      platform
    });

    res.status(201).json({
      success: true,
      message: 'External platform API key saved.',
      data: record
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || 'Could not save API key.'
    });
  }
};

const deleteScoringKey = (req, res) => {
  const deleted = scoringKeyStore.deleteKey(req.params.id);

  if (!deleted) {
    return res.status(404).json({
      success: false,
      message: 'API key not found.'
    });
  }

  res.json({
    success: true,
    message: 'API key deleted.'
  });
};

module.exports = {
  listScoringKeys,
  createScoringKey,
  deleteScoringKey
};
