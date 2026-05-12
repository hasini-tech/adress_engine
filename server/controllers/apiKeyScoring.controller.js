// server/controllers/apiKeyScoring.controller.js

const {
  processApiKey,
  getAllApiKeys,
  getApiKeyDetail,
  getScoreDistribution,
  deleteApiKey,
} = require('../services/apiKeyScoring.service');

// ─── POST /api/api-keys/score ─────────────────────────────────────────────
// Triggers full pipeline: validate → fetch → score → save
// Uses Server-Sent Events to stream progress to the frontend in real time
async function scoreApiKey(req, res) {
  const { api_key, label } = req.body;

  if (!api_key || String(api_key).trim() === '') {
    return res.status(400).json({ error: 'api_key is required' });
  }

  // Set up SSE headers for streaming progress
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const result = await processApiKey(
      String(api_key).trim(),
      label || null,
      ({ stage, fetched, total }) => {
        send({ type: 'progress', stage, fetched, total });
      },
    );

    send({ type: 'complete', result });
  } catch (err) {
    send({ type: 'error', message: err.message });
  } finally {
    res.end();
  }
}

// ─── GET /api/api-keys ────────────────────────────────────────────────────
async function listApiKeys(req, res) {
  try {
    const { page = 1, limit = 20, band, status } = req.query;
    const result = await getAllApiKeys({
      page:   Number(page),
      limit:  Number(limit),
      band:   band   || undefined,
      status: status || undefined,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ─── GET /api/api-keys/:id ────────────────────────────────────────────────
async function getApiKey(req, res) {
  try {
    const record = await getApiKeyDetail(req.params.id);
    if (!record) return res.status(404).json({ error: 'API key not found' });
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ─── GET /api/api-keys/distribution ──────────────────────────────────────
async function getDistribution(req, res) {
  try {
    const data = await getScoreDistribution();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ─── DELETE /api/api-keys/:id ─────────────────────────────────────────────
async function removeApiKey(req, res) {
  try {
    await deleteApiKey(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { scoreApiKey, listApiKeys, getApiKey, getDistribution, removeApiKey };