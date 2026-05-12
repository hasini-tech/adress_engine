// server/services/apiKeyScoring.service.js
// Orchestrates: validate key → fetch all addresses → score → save to MySQL via Prisma

const { PrismaClient } = require('@prisma/client');
const { validateApiKey, fetchAllAddresses, fetchKeyUsageStats } = require('./addressEngine.service');
const { scoreAddressRecords } = require('./scoringEngine.service');

const prisma = new PrismaClient();

/**
 * Full pipeline: validate → fetch → score → persist
 * 
 * @param {string}   apiKey      - the key entered by the user
 * @param {string}   label       - optional friendly label
 * @param {Function} onProgress  - optional callback(stage, fetched, total) for SSE
 * @returns {Object}             - saved score detail record
 */
async function processApiKey(apiKey, label = null, onProgress = null) {
  const notify = (stage, fetched = 0, total = 0) => {
    if (onProgress) onProgress({ stage, fetched, total });
  };

  // ── 1. Validate the key ────────────────────────────────────────────────
  notify('validating');
  const validation = await validateApiKey(apiKey);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid API key');
  }

  // ── 2. Upsert ApiKey row (create if new, update status if re-scoring) ──
  notify('saving_key');
  const keyRecord = await prisma.apiKey.upsert({
    where:  { api_key: apiKey },
    create: { api_key: apiKey, label: label || null, status: 'pending' },
    update: { status: 'pending', label: label || undefined },
  });

  // ── 3. Fetch ALL address records from the address engine ───────────────
  notify('fetching', 0, 0);
  let fetchResult;
  const fetchStart = Date.now();

  try {
    fetchResult = await fetchAllAddresses(apiKey, (fetched, total) => {
      notify('fetching', fetched, total);
    });
  } catch (fetchErr) {
    // Log the failed fetch
    await prisma.apiKeyFetchLog.create({
      data: {
        api_key_id:      keyRecord.id,
        status:          'failed',
        records_fetched: 0,
        duration_ms:     Date.now() - fetchStart,
        error_message:   fetchErr.message,
      },
    });
    await prisma.apiKey.update({
      where: { id: keyRecord.id },
      data:  { status: 'failed' },
    });
    throw new Error(`Failed to fetch address data: ${fetchErr.message}`);
  }

  // Log successful fetch
  await prisma.apiKeyFetchLog.create({
    data: {
      api_key_id:      keyRecord.id,
      status:          'success',
      records_fetched: fetchResult.totalFetched,
      duration_ms:     fetchResult.durationMs,
    },
  });

  // ── 4. Score the fetched records ──────────────────────────────────────
  notify('scoring', fetchResult.totalFetched, fetchResult.totalFetched);
  const scoreResult = scoreAddressRecords(fetchResult.records);

  // ── 5. Save score detail to MySQL ─────────────────────────────────────
  notify('saving_score');
  const scoreDetail = await prisma.apiKeyScoreDetail.create({
    data: {
      api_key_id:         keyRecord.id,
      completeness_score: scoreResult.completeness_score,
      validity_score:     scoreResult.validity_score,
      coverage_score:     scoreResult.coverage_score,
      uniqueness_score:   scoreResult.uniqueness_score,
      freshness_score:    scoreResult.freshness_score,
      composite_score:    scoreResult.composite_score,
      score_band:         scoreResult.score_band,
      total_records:      scoreResult.total_records,
      valid_records:      scoreResult.valid_records,
      invalid_records:    scoreResult.invalid_records,
      duplicate_records:  scoreResult.duplicate_records,
      missing_fields_pct: scoreResult.missing_fields_pct,
      country_coverage:   scoreResult.country_coverage,
      city_coverage:      scoreResult.city_coverage,
      issues:             scoreResult.issues,
    },
  });

  // ── 6. Update the master ApiKey row with latest score ─────────────────
  await prisma.apiKey.update({
    where: { id: keyRecord.id },
    data: {
      status:          'scored',
      total_score:     scoreResult.composite_score,
      score_band:      scoreResult.score_band,
      total_records:   fetchResult.totalFetched,
      last_fetched_at: new Date(),
      last_scored_at:  new Date(),
    },
  });

  notify('done');

  return {
    api_key_id:   keyRecord.id,
    score_detail: scoreDetail,
    score:        scoreResult,
    fetch_stats: {
      total_fetched: fetchResult.totalFetched,
      duration_ms:   fetchResult.durationMs,
    },
  };
}

// ─── Read helpers ──────────────────────────────────────────────────────────

/** Get all API keys with their latest score */
async function getAllApiKeys({ page = 1, limit = 20, band, status } = {}) {
  const where = {};
  if (band)   where.score_band = band;
  if (status) where.status     = status;

  const [data, total] = await Promise.all([
    prisma.apiKey.findMany({
      where,
      skip:    (page - 1) * limit,
      take:    limit,
      orderBy: { last_scored_at: 'desc' },
      include: {
        score_details: { orderBy: { scored_at: 'desc' }, take: 1 },
        fetch_logs:    { orderBy: { fetched_at: 'desc' }, take: 1 },
      },
    }),
    prisma.apiKey.count({ where }),
  ]);

  return { data, total, page, limit, pages: Math.ceil(total / limit) };
}

/** Get a single API key with full score history */
async function getApiKeyDetail(id) {
  return prisma.apiKey.findUnique({
    where:   { id: Number(id) },
    include: {
      score_details: { orderBy: { scored_at: 'desc' }, take: 10 },
      fetch_logs:    { orderBy: { fetched_at: 'desc' }, take: 5 },
    },
  });
}

/** Score distribution across all keys — for dashboard summary cards */
async function getScoreDistribution() {
  const bands = await prisma.apiKey.groupBy({
    by:      ['score_band'],
    _count:  { id: true },
    _avg:    { total_score: true },
    where:   { status: 'scored' },
    orderBy: { score_band: 'asc' },
  });

  const total = await prisma.apiKey.count({ where: { status: 'scored' } });

  return { bands, total };
}

/** Delete an API key and all related data */
async function deleteApiKey(id) {
  return prisma.apiKey.delete({ where: { id: Number(id) } });
}

module.exports = {
  processApiKey,
  getAllApiKeys,
  getApiKeyDetail,
  getScoreDistribution,
  deleteApiKey,
};