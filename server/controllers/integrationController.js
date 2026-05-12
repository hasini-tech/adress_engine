const apiKeyStore = require('../services/apiKeyStore');
const clientService = require('../services/clientService');

const listApiKeys = (req, res) => {
  res.json({
    success: true,
    keys: apiKeyStore.listKeys()
  });
};

const createApiKey = (req, res) => {
  const { name, platform, website, notes } = req.body || {};

  if (!String(name || '').trim()) {
    return res.status(400).json({
      success: false,
      message: 'Key name is required.'
    });
  }

  const result = apiKeyStore.createKey({ name, platform, website, notes });
  res.status(201).json({
    success: true,
    message: 'API key created.',
    apiKey: result.apiKey,
    key: result.record
  });
};

const updateApiKey = (req, res) => {
  const updated = apiKeyStore.updateKey(req.params.id, req.body || {});
  if (!updated) {
    return res.status(404).json({
      success: false,
      message: 'API key not found.'
    });
  }

  res.json({
    success: true,
    key: updated
  });
};

const deleteApiKey = (req, res) => {
  const deleted = apiKeyStore.deleteKey(req.params.id);
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

const checkoutLookup = async (req, res) => {
  try {
    const { q = '', email = '', phone = '', limit = 5 } = req.query;
    const lookup = await clientService.lookupCheckoutAddress({
      q,
      email,
      phone,
      limit: parseInt(limit, 10) || 5
    });

    res.json({
      success: true,
      integration: req.apiKey,
      ...lookup
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Checkout lookup failed.'
    });
  }
};

module.exports = {
  listApiKeys,
  createApiKey,
  updateApiKey,
  deleteApiKey,
  checkoutLookup
};
