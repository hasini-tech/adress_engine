const {
  saveApiKeyToDb,
  getAllApiKeys,
  getApiKeyDetail,
  deleteApiKeyById,
  fetchCustomersWithApiKey,
  getCustomersByKeyId,
  scoreCustomersForApiKey,
  fetchAndScoreCustomersWithApiKey,
} = require('../services/apiKeyScoring.service');

function maskSecretText(value) {
  return String(value || '').replace(
    /\b(sk_(?:live|test)_[A-Za-z0-9_-]{8})[A-Za-z0-9_-]+/g,
    '$1...',
  );
}

function maskSensitiveFields(record) {
  if (!record) return record;

  return {
    ...record,
    baseUrl: maskSecretText(record.baseUrl),
    exportPath: maskSecretText(record.exportPath),
  };
}

function sendError(res, err, fallbackStatus = 500) {
  const status = Number(err.status) || fallbackStatus;
  res.status(status).json({
    error: err.message,
    externalStatus: err.externalStatus || undefined,
  });
}

async function listScoringKeys(req, res) {
  try {
    const { page = 1, limit = 20, band, status } = req.query;
    const result = await getAllApiKeys({
      page: Number(page),
      limit: Number(limit),
      band: band || undefined,
      status: status || undefined,
    });

    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
}

async function createScoringKey(req, res) {
  const {
    api_key,
    label,
    platform,
    platformKey,
    baseUrl,
    exportPath,
    authMode,
    responsePath,
  } = req.body || {};

  if (!api_key || String(api_key).trim() === '') {
    return res.status(400).json({ error: 'api_key is required' });
  }

  if (!label || String(label).trim() === '') {
    return res.status(400).json({ error: 'Store name is required.' });
  }

  if (!baseUrl || String(baseUrl).trim() === '') {
    return res.status(400).json({ error: 'Platform Base URL is required.' });
  }

  if (!exportPath || String(exportPath).trim() === '') {
    return res.status(400).json({ error: 'API Endpoints are required.' });
  }

  try {
    const record = await saveApiKeyToDb({
      api_key: String(api_key).trim(),
      label: String(label).trim(),
      platform: platform || 'Another Platform',
      platformKey: platformKey || 'custom',
      baseUrl: baseUrl || null,
      exportPath: exportPath || null,
      authMode: authMode || null,
      responsePath: responsePath || null,
    });
    const { apiKey, ...safeRecord } = record;

    res.json({ success: true, message: 'Store API key saved successfully.', data: maskSensitiveFields(safeRecord) });
  } catch (err) {
    sendError(res, err);
  }
}

async function getScoringKeyDetail(req, res) {
  try {
    const record = await getApiKeyDetail(req.params.id);

    if (!record) {
      return res.status(404).json({ error: 'API key not found' });
    }

    res.json(record);
  } catch (err) {
    sendError(res, err);
  }
}

async function deleteScoringKey(req, res) {
  try {
    await deleteApiKeyById(req.params.id);
    res.json({ success: true, message: 'API key deleted.' });
  } catch (err) {
    sendError(res, err);
  }
}

async function fetchCustomers(req, res) {
  try {
    const result = await fetchCustomersWithApiKey(req.params.id, req.body || {});
    res.json({ success: true, ...result });
  } catch (err) {
    sendError(res, err);
  }
}

async function scoreCustomers(req, res) {
  try {
    const result = await scoreCustomersForApiKey(req.params.id);
    res.json({ success: true, ...result });
  } catch (err) {
    sendError(res, err);
  }
}

async function fetchAndScoreCustomers(req, res) {
  try {
    const result = await fetchAndScoreCustomersWithApiKey(req.params.id, req.body || {});
    res.json({ success: true, ...result });
  } catch (err) {
    sendError(res, err);
  }
}

async function listCustomers(req, res) {
  try {
    const customers = await getCustomersByKeyId(req.params.id);
    res.json({ success: true, data: customers, total: customers.length });
  } catch (err) {
    sendError(res, err);
  }
}

module.exports = {
  listScoringKeys,
  createScoringKey,
  getScoringKeyDetail,
  deleteScoringKey,
  fetchCustomers,
  scoreCustomers,
  fetchAndScoreCustomers,
  listCustomers,
};
