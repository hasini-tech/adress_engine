// server/services/scoringEngine.service.js
// Pure scoring logic — receives raw address records, returns score breakdown.
// No DB calls here — fully testable in isolation.

// ─── Weights (must sum to 1.0) ────────────────────────────────────────────
const WEIGHTS = {
  completeness: 0.30, // required fields filled
  validity:     0.30, // valid/deliverable address format
  uniqueness:   0.20, // no duplicate addresses
  coverage:     0.10, // geographic spread
  freshness:    0.10, // how recent the records are
};

// ─── Required address fields ──────────────────────────────────────────────
const REQUIRED_FIELDS  = ['address', 'city', 'country'];
const OPTIONAL_FIELDS  = ['state', 'postal_code', 'company', 'name', 'email', 'phone'];

// ─── Validators ───────────────────────────────────────────────────────────
const EMAIL_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE  = /^\+?[\d\s\-().]{7,20}$/;
const POSTAL_RE = /^[A-Z0-9\s\-]{3,10}$/i;

// ─── Band ─────────────────────────────────────────────────────────────────
function getBand(score) {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 55) return 'C';
  if (score >= 35) return 'D';
  return 'F';
}

// ─── 1. Completeness (0-100) ──────────────────────────────────────────────
// % of records where all required fields are non-empty
function scoreCompleteness(records) {
  if (!records.length) return { score: 0, missing_fields_pct: 100, issues: [] };

  const fieldMissingCount = {};
  let completeCount = 0;

  for (const rec of records) {
    let recComplete = true;
    for (const f of REQUIRED_FIELDS) {
      if (!rec[f] || String(rec[f]).trim() === '') {
        fieldMissingCount[f] = (fieldMissingCount[f] || 0) + 1;
        recComplete = false;
      }
    }
    if (recComplete) completeCount++;
  }

  const score = Math.round((completeCount / records.length) * 100);
  const missing_fields_pct = Math.round(((records.length - completeCount) / records.length) * 100);

  const issues = Object.entries(fieldMissingCount).map(([field, count]) => ({
    field,
    issue:   'Missing required field',
    count,
    pct:     Math.round((count / records.length) * 100),
  }));

  return { score, missing_fields_pct, issues };
}

// ─── 2. Validity (0-100) ─────────────────────────────────────────────────
// % of records passing format validation on key fields
function scoreValidity(records) {
  if (!records.length) return { score: 0, valid_records: 0, invalid_records: 0, issues: [] };

  const issueMap = {};
  let validCount = 0;

  for (const rec of records) {
    let recValid = true;

    if (rec.email && !EMAIL_RE.test(String(rec.email).trim())) {
      issueMap['email'] = (issueMap['email'] || 0) + 1;
      recValid = false;
    }
    if (rec.phone && !PHONE_RE.test(String(rec.phone).replace(/\s/g, ''))) {
      issueMap['phone'] = (issueMap['phone'] || 0) + 1;
      recValid = false;
    }
    if (rec.postal_code && !POSTAL_RE.test(String(rec.postal_code))) {
      issueMap['postal_code'] = (issueMap['postal_code'] || 0) + 1;
      recValid = false;
    }
    // Address must be at least 5 chars
    if (rec.address && String(rec.address).trim().length < 5) {
      issueMap['address'] = (issueMap['address'] || 0) + 1;
      recValid = false;
    }

    if (recValid) validCount++;
  }

  const score = Math.round((validCount / records.length) * 100);
  const issues = Object.entries(issueMap).map(([field, count]) => ({
    field,
    issue: 'Format validation failed',
    count,
    pct:   Math.round((count / records.length) * 100),
  }));

  return {
    score,
    valid_records:   validCount,
    invalid_records: records.length - validCount,
    issues,
  };
}

// ─── 3. Uniqueness (0-100) ────────────────────────────────────────────────
// Penalises duplicate addresses (same address+city+country)
function scoreUniqueness(records) {
  if (!records.length) return { score: 0, duplicate_records: 0 };

  const seen = new Set();
  let duplicates = 0;

  for (const rec of records) {
    const key = [
      String(rec.address  || '').trim().toLowerCase(),
      String(rec.city     || '').trim().toLowerCase(),
      String(rec.country  || '').trim().toLowerCase(),
    ].join('|');

    if (seen.has(key)) {
      duplicates++;
    } else {
      seen.add(key);
    }
  }

  const score = Math.round(((records.length - duplicates) / records.length) * 100);
  return { score, duplicate_records: duplicates };
}

// ─── 4. Coverage (0-100) ─────────────────────────────────────────────────
// Rewards geographic diversity (unique countries + cities)
function scoreCoverage(records) {
  if (!records.length) return { score: 0, country_coverage: 0, city_coverage: 0 };

  const countries = new Set();
  const cities    = new Set();

  for (const rec of records) {
    if (rec.country) countries.add(String(rec.country).trim().toLowerCase());
    if (rec.city)    cities.add(String(rec.city).trim().toLowerCase());
  }

  const countryCount = countries.size;
  const cityCount    = cities.size;

  // Score: 1 country=40, 3+=60, 5+=80, 10+=100 (geo diversity is good)
  let score = 40;
  if (countryCount >= 3)  score = 60;
  if (countryCount >= 5)  score = 75;
  if (countryCount >= 10) score = 90;
  // Boost for city spread within countries
  const cityRatio = Math.min(cityCount / Math.max(records.length * 0.5, 1), 1);
  score = Math.min(100, Math.round(score + cityRatio * 10));

  return { score, country_coverage: countryCount, city_coverage: cityCount };
}

// ─── 5. Freshness (0-100) ────────────────────────────────────────────────
// Scores based on created_at / updated_at spread of records
function scoreFreshness(records) {
  if (!records.length) return { score: 50 }; // neutral if no dates

  const now = Date.now();
  const dates = records
    .map(r => r.updated_at || r.created_at)
    .filter(Boolean)
    .map(d => new Date(d).getTime())
    .filter(t => !isNaN(t));

  if (!dates.length) return { score: 50 };

  const avgAge = dates.reduce((sum, t) => sum + (now - t), 0) / dates.length;
  const avgAgeDays = avgAge / (1000 * 60 * 60 * 24);

  // <30 days=100, 90 days=80, 180 days=60, 365 days=40, >730 days=10
  let score;
  if (avgAgeDays <= 30)  score = 100;
  else if (avgAgeDays <= 90)  score = 80;
  else if (avgAgeDays <= 180) score = 60;
  else if (avgAgeDays <= 365) score = 40;
  else score = 10;

  return { score };
}

// ─── Master scorer ────────────────────────────────────────────────────────
/**
 * Scores all address records fetched for an API key.
 * @param {Array} records  - raw address objects from the address engine
 * @returns {Object}       - full score breakdown + composite
 */
function scoreAddressRecords(records) {
  if (!records || records.length === 0) {
    return {
      composite_score:    0,
      score_band:         'F',
      total_records:      0,
      valid_records:      0,
      invalid_records:    0,
      duplicate_records:  0,
      missing_fields_pct: 100,
      country_coverage:   0,
      city_coverage:      0,
      completeness_score: 0,
      validity_score:     0,
      uniqueness_score:   0,
      coverage_score:     0,
      freshness_score:    0,
      issues: [{ field: 'data', issue: 'No records found for this API key', count: 0 }],
    };
  }

  const completeness = scoreCompleteness(records);
  const validity     = scoreValidity(records);
  const uniqueness   = scoreUniqueness(records);
  const coverage     = scoreCoverage(records);
  const freshness    = scoreFreshness(records);

  const composite = Math.round(
    completeness.score * WEIGHTS.completeness +
    validity.score     * WEIGHTS.validity     +
    uniqueness.score   * WEIGHTS.uniqueness   +
    coverage.score     * WEIGHTS.coverage     +
    freshness.score    * WEIGHTS.freshness,
  );

  // Merge all issues
  const issues = [
    ...(completeness.issues || []),
    ...(validity.issues || []),
  ];

  return {
    composite_score:    composite,
    score_band:         getBand(composite),
    total_records:      records.length,
    valid_records:      validity.valid_records,
    invalid_records:    validity.invalid_records,
    duplicate_records:  uniqueness.duplicate_records,
    missing_fields_pct: completeness.missing_fields_pct,
    country_coverage:   coverage.country_coverage,
    city_coverage:      coverage.city_coverage,
    completeness_score: completeness.score,
    validity_score:     validity.score,
    uniqueness_score:   uniqueness.score,
    coverage_score:     coverage.score,
    freshness_score:    freshness.score,
    issues,
  };
}

module.exports = { scoreAddressRecords, getBand };