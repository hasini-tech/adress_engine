const apiKeyStore = require('../services/apiKeyStore');

function extractApiKey(req) {
  const headerKey = req.headers['x-api-key'];
  if (headerKey) return String(headerKey).trim();

  const authHeader = req.headers.authorization || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }

  return '';
}

module.exports = (req, res, next) => {
  const rawKey = extractApiKey(req);

  if (!rawKey) {
    return res.status(401).json({
      success: false,
      message: 'API key missing. Send x-api-key header.'
    });
  }

  const apiKey = apiKeyStore.validateKey(rawKey);
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or inactive API key.'
    });
  }

  req.apiKey = apiKey;
  next();
};
