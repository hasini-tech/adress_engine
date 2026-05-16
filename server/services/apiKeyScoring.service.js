const prisma = require('../lib/prisma');
const { scoreAddressRecords } = require('./scoringEngine.service');

const DEFAULT_PLATFORM = 'Another Platform';
const DEFAULT_BASE_URL =
  process.env.ANOTHER_PLATFORM_BASE_URL ||
  process.env.EXTERNAL_PLATFORM_BASE_URL ||
  process.env.SAAS_PLATFORM_BASE_URL ||
  'http://localhost:8000';
const DEFAULT_EXPORT_PATH =
  process.env.ANOTHER_PLATFORM_EXPORT_PATH ||
  process.env.EXTERNAL_PLATFORM_EXPORT_PATH ||
  '/api/customers/export';

const PLATFORM_PRESETS = {
  custom: {
    label: 'Custom Platform',
    authMode: 'both',
    candidatePaths: [],
  },
  gowhats: {
    label: 'GoWhats',
    baseUrl: 'https://bot.gowhats.in',
    authMode: 'bearer',
    exportPath: '/api/v1/orders',
    candidatePaths: ['/api/v1/orders', '/api/v1/contacts'],
  },
  generic_orders: {
    label: 'Generic Orders API',
    authMode: 'both',
    exportPath: '/api/orders',
    candidatePaths: ['/api/orders', '/orders'],
  },
  generic_customers: {
    label: 'Generic Customers API',
    authMode: 'both',
    exportPath: '/api/customers/export',
    candidatePaths: ['/api/customers/export', '/api/customers', '/customers/export', '/customers'],
  },
  generic_contacts: {
    label: 'Generic Contacts API',
    authMode: 'both',
    exportPath: '/api/contacts',
    candidatePaths: ['/api/contacts', '/contacts'],
  },
};

const PUBLIC_WEB_APP_API_HOSTS = new Set(['billzzy.com', 'www.billzzy.com']);

async function fetchImpl(url, options) {
  if (typeof fetch === 'function') {
    return fetch(url, options);
  }
  const { default: nodeFetch } = await import('node-fetch');
  return nodeFetch(url, options);
}

function maskApiKey(apiKey) {
  if (!apiKey) return '';
  const value = String(apiKey).trim();
  if (value.length > 12) {
    return `${value.slice(0, 6)}${'*'.repeat(value.length - 10)}${value.slice(-4)}`;
  }
  return `${value.slice(0, 3)}***`;
}

function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function firstNonEmpty(...values) {
  return values.find(hasValue);
}

function normalizePlatformKey(value) {
  const key = String(value || 'custom')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return PLATFORM_PRESETS[key] ? key : 'custom';
}

function normalizeAuthMode(value) {
  const mode = String(value || 'both').trim().toLowerCase();
  if (['bearer', 'x-api-key', 'both', 'auto'].includes(mode)) {
    return mode;
  }
  return 'both';
}

function sanitizeBaseUrl(value) {
  if (!hasValue(value)) return null;
  return String(value).trim().replace(/\/+$/, '');
}

function sanitizeExportPath(value) {
  if (!hasValue(value)) return null;
  const text = String(value).trim();
  if (/^https?:\/\//i.test(text)) return text;
  return `/${text.replace(/^\/+/, '')}`;
}

function parseExportPaths(value) {
  if (!hasValue(value)) return [];
  if (Array.isArray(value)) {
    return value.flatMap(parseExportPaths);
  }
  return String(value)
    .split(',')
    .map((part) => sanitizeExportPath(part))
    .filter(Boolean);
}

function sanitizeExportPathList(value) {
  const paths = parseExportPaths(value);
  if (!paths.length) return null;
  return [...new Set(paths)].join(', ');
}

function getBaseUrlHost(baseUrl) {
  const text = String(baseUrl || '').trim();
  if (!text) return '';
  try {
    return new URL(text).hostname.toLowerCase();
  } catch {
    return text.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
  }
}

function isBillzzyApiHost(baseUrl) {
  return /(^|\.)f3engine\.com$|(^|\.)billzzy\.com$/.test(getBaseUrlHost(baseUrl));
}

function isPublicWebAppHost(baseUrl) {
  return PUBLIC_WEB_APP_API_HOSTS.has(getBaseUrlHost(baseUrl));
}

function getEndpointPathname(endpoint) {
  const text = String(endpoint || '').trim();
  try {
    return new URL(text).pathname.toLowerCase();
  } catch {
    return text.toLowerCase();
  }
}

function buildPlatformCandidatePaths(baseUrl, exportPath) {
  const paths = parseExportPaths(exportPath);

  if (!isBillzzyApiHost(baseUrl)) {
    return paths;
  }

  const candidates = [];

  for (const path of paths) {
    if (!path) continue;
    candidates.push(path);

    const normalizedPath = getEndpointPathname(path);

    if (
      normalizedPath === '/api/v1/orders' ||
      normalizedPath === '/api/v1/contacts' ||
      normalizedPath === '/v1/orders' ||
      normalizedPath === '/v1/contacts'
    ) {
      candidates.push('/api/external/orders');
    }

    if (normalizedPath === '/api/external/orders') {
      candidates.push('/external/api/orders', '/api/v1/orders', '/api/v1/contacts');
    }

    if (normalizedPath === '/external/api/orders') {
      candidates.push('/api/external/orders', '/api/v1/orders', '/api/v1/contacts');
    }
  }

  return [...new Set(candidates)];
}

function sanitizeResponsePath(value) {
  if (!hasValue(value)) return null;
  return String(value).trim().replace(/^\.|\.$/g, '') || null;
}

function toTrimmedString(value) {
  if (!hasValue(value)) return null;
  return String(value).trim();
}

function normalizeAddressValue(value) {
  if (!hasValue(value)) return null;

  if (typeof value === 'string') {
    const text = value.trim();
    return text || null;
  }

  if (typeof value === 'object') {
    const text = [
      value.address,
      value.address1,
      value.address2,
      value.line1,
      value.line2,
      value.street,
      value.street1,
      value.street2,
      value.full_address,
      value.formatted,
    ]
      .map(toTrimmedString)
      .filter(Boolean)
      .join(', ');
    return text || null;
  }

  return null;
}

function normalizePurchaseProduct(value) {
  if (!hasValue(value)) return null;

  if (Array.isArray(value)) {
    const text = value
      .map((item) => normalizePurchaseProduct(item))
      .filter(Boolean)
      .join(', ');
    return text ? text.substring(0, 500) : null;
  }

  if (typeof value === 'object') {
    return normalizePurchaseProduct(
      firstNonEmpty(
        value.name,
        value.productName,
        value.product_name,
        value.title,
        value.itemName,
        value.item_name,
        value.sku,
      ),
    );
  }

  const text = String(value).trim();
  return text ? text.substring(0, 500) : null;
}

function normalizePurchaseAmount(value) {
  if (!hasValue(value)) return null;

  if (typeof value === 'object') {
    return normalizePurchaseAmount(firstNonEmpty(value.amount, value.total, value.value, value.price));
  }

  const numericText = String(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!numericText) return null;

  const amount = Number(numericText[0]);
  if (!Number.isFinite(amount)) return null;

  return amount.toFixed(2);
}

function extractPurchaseDetails(raw = {}) {
  const lineItems = firstNonEmpty(
    raw.line_items,
    raw.lineItems,
    raw.items,
    raw.products,
    raw.order_items,
    raw.orderItems,
    raw.productDetails,
    raw.product_details,
  );
  const firstLineItem = Array.isArray(lineItems) ? lineItems[0] : lineItems;

  return {
    purchaseProduct: normalizePurchaseProduct(
      firstNonEmpty(
        raw.purchase_product,
        raw.purchaseProduct,
        raw.product,
        raw.productName,
        raw.product_name,
        raw.product_title,
        raw.item,
        raw.itemName,
        raw.item_name,
        raw.title,
        lineItems,
      ),
    ),
    purchaseAmount: normalizePurchaseAmount(
      firstNonEmpty(
        raw.purchase_amount,
        raw.purchaseAmount,
        raw.amount,
        raw.totalAmount,
        raw.total_amount,
        raw.orderTotal,
        raw.order_total,
        raw.grandTotal,
        raw.grand_total,
        raw.total,
        raw.subtotal,
        raw.price,
        raw.paymentAmount,
        raw.payment_amount,
        firstLineItem && firstNonEmpty(
          firstLineItem.total,
          firstLineItem.price,
          firstLineItem.subtotal,
          firstLineItem.amount,
        ),
      ),
    ),
  };
}

function getPlatformPreset(platformKey) {
  return PLATFORM_PRESETS[normalizePlatformKey(platformKey)] || PLATFORM_PRESETS.custom;
}

function inferPlatformKey(input = {}, fallbackKey = 'custom') {
  const normalizedFallback = normalizePlatformKey(fallbackKey);
  const explicitPlatformKey = hasValue(input.platformKey);
  const platformLabel = String(input.platform || '').trim().toLowerCase();

  if (explicitPlatformKey && normalizedFallback === 'custom') {
    return 'custom';
  }

  if (platformLabel === 'custom platform') {
    return 'custom';
  }

  if (normalizedFallback !== 'custom') {
    return normalizedFallback;
  }

  const apiKey = String(input.apiKey || input.api_key || '').trim().toLowerCase();
  const platformText = [
    input.platform,
    input.label,
    input.baseUrl,
    input.exportPath,
    DEFAULT_BASE_URL,
  ]
    .filter(hasValue)
    .join(' ')
    .toLowerCase();

  if (
    /^gw_/.test(apiKey) ||
    /gowhats/.test(platformText) ||
    /bot\.gowhats\.in/.test(platformText)
  ) {
    return 'gowhats';
  }

  if (/contacts/.test(platformText)) return 'generic_contacts';
  if (/customers/.test(platformText)) return 'generic_customers';
  if (/orders/.test(platformText)) return 'generic_orders';

  return normalizedFallback;
}

function buildConfigFromInput(input = {}) {
  const platformKey = inferPlatformKey(
    { ...input, platformKey: input.platformKey },
    input.platformKey,
  );
  const preset = getPlatformPreset(platformKey);
  const fallbackPath = preset.exportPath || preset.candidatePaths?.[0] || DEFAULT_EXPORT_PATH;
  const baseUrl = sanitizeBaseUrl(input.baseUrl) || sanitizeBaseUrl(preset.baseUrl) || sanitizeBaseUrl(DEFAULT_BASE_URL);
  const exportPath = sanitizeExportPathList(input.exportPath) || sanitizeExportPath(fallbackPath);

  return {
    platform: toTrimmedString(input.platform) || preset.label || DEFAULT_PLATFORM,
    platformKey,
    baseUrl,
    exportPath,
    authMode: normalizeAuthMode(input.authMode || preset.authMode || 'both'),
    responsePath: sanitizeResponsePath(input.responsePath) || sanitizeResponsePath(preset.responsePath),
  };
}

function resolveKeyFetchConfig(record, options = {}) {
  const platformKey = inferPlatformKey(
    {
      apiKey: record?.apiKey,
      platform: options.platform || record?.platform,
      label: options.label || record?.label,
      baseUrl: options.baseUrl || record?.baseUrl,
      exportPath: options.exportPath || record?.exportPath,
    },
    options.platformKey || record?.platformKey || 'custom',
  );
  const preset = getPlatformPreset(platformKey);
  const requestedAuthMode = normalizeAuthMode(options.authMode || record?.authMode || preset.authMode || 'both');
  const authMode =
    !options.authMode && requestedAuthMode === 'bearer' && preset.authMode !== 'bearer'
      ? 'auto'
      : requestedAuthMode;
  const baseUrl =
    sanitizeBaseUrl(options.baseUrl) ||
    sanitizeBaseUrl(record?.baseUrl) ||
    sanitizeBaseUrl(preset.baseUrl) ||
    sanitizeBaseUrl(DEFAULT_BASE_URL);
  const exportPath =
    sanitizeExportPathList(options.exportPath) ||
    sanitizeExportPathList(record?.exportPath) ||
    sanitizeExportPath(preset.exportPath) ||
    sanitizeExportPath(DEFAULT_EXPORT_PATH);

  return {
    platform:
      toTrimmedString(options.platform) ||
      (record?.platform && record.platform !== DEFAULT_PLATFORM ? record.platform : null) ||
      preset.label ||
      DEFAULT_PLATFORM,
    platformKey,
    baseUrl,
    exportPath,
    authMode,
    responsePath:
      sanitizeResponsePath(options.responsePath) ||
      sanitizeResponsePath(record?.responsePath) ||
      sanitizeResponsePath(preset.responsePath),
    candidatePaths: [
      ...new Set([
        ...buildPlatformCandidatePaths(baseUrl, exportPath),
        sanitizeExportPath(preset.exportPath),
        ...(preset.candidatePaths || []).map(sanitizeExportPath),
      ].filter(Boolean)),
    ],
    limit: Number(options.limit) || null,
  };
}

function buildCandidateUrls(config) {
  const paths = config.candidatePaths.length
    ? config.candidatePaths
    : [sanitizeExportPath(DEFAULT_EXPORT_PATH)];

  const urls = [];

  for (const path of paths) {
    if (!path) continue;

    if (/^https?:\/\//i.test(path)) {
      urls.push(path);
      continue;
    }

    if (!config.baseUrl) continue;
    urls.push(`${config.baseUrl}${path}`);
  }

  return [...new Set(urls)];
}

function maskSecretText(value) {
  return String(value || '').replace(
    /\b(sk_(?:live|test)_[A-Za-z0-9_-]{8})[A-Za-z0-9_-]+/g,
    '$1...',
  );
}

function maskSensitiveUrl(value) {
  const text = String(value || '');
  try {
    const url = new URL(text);
    url.pathname = url.pathname
      .split('/')
      .map((segment) => maskSecretText(segment))
      .join('/');
    return url.toString();
  } catch {
    return maskSecretText(text);
  }
}

function maskSensitiveUrls(values) {
  return values.map(maskSensitiveUrl);
}

function readValueAtPath(source, path) {
  if (!path) return undefined;
  return path.split('.').reduce((current, key) => {
    if (current === null || current === undefined) return undefined;
    return current[key];
  }, source);
}

function looksLikeCustomerRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

  const keys = new Set(Object.keys(value).map((key) => key.toLowerCase()));
  const usefulFields = [
    'address',
    'address1',
    'address_line_1',
    'billingaddress',
    'billing_address',
    'city',
    'customer',
    'customerdetails',
    'customer_details',
    'customername',
    'customer_name',
    'email',
    'full_name',
    'name',
    'orderid',
    'order_id',
    'phone',
    'shippingaddress',
    'shipping_address',
    'state',
  ];

  return usefulFields.some((field) => keys.has(field));
}

function findCustomerArrayDeep(source, depth = 0, seen = new Set()) {
  if (!source || typeof source !== 'object' || depth > 5 || seen.has(source)) {
    return null;
  }

  seen.add(source);

  if (Array.isArray(source)) {
    if (!source.length) return null;
    const sample = source.slice(0, 5);
    const matchCount = sample.filter(looksLikeCustomerRecord).length;
    return matchCount > 0 ? source : null;
  }

  const preferredKeys = [
    'customers',
    'contacts',
    'orders',
    'data',
    'results',
    'records',
    'items',
    'list',
    'rows',
    'partners',
    'partnerData',
    'partner_data',
  ];

  for (const key of preferredKeys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const found = findCustomerArrayDeep(source[key], depth + 1, seen);
      if (found) return found;
    }
  }

  for (const value of Object.values(source)) {
    const found = findCustomerArrayDeep(value, depth + 1, seen);
    if (found) return found;
  }

  return null;
}

function describePayloadShape(payload) {
  if (!payload || typeof payload !== 'object') return '';

  const topKeys = Object.keys(payload).slice(0, 12);
  const nestedKeys = [];

  for (const key of topKeys) {
    const value = payload[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      nestedKeys.push(`${key}.${Object.keys(value).slice(0, 8).join('|')}`);
    }
  }

  const parts = [];
  if (topKeys.length) parts.push(`Top-level keys: ${topKeys.join(', ')}.`);
  if (nestedKeys.length) parts.push(`Nested keys: ${nestedKeys.join(', ')}.`);

  return parts.length ? ` ${parts.join(' ')}` : '';
}

function resolveCustomerArray(payload, responsePath) {
  const explicitValue = readValueAtPath(payload, responsePath);
  if (Array.isArray(explicitValue)) return explicitValue;

  if (Array.isArray(payload)) return payload;

  const directCandidates = [
    payload?.customers,
    payload?.contacts,
    payload?.orders,
    payload?.data,
    payload?.results,
    payload?.records,
    payload?.items,
  ];

  for (const candidate of directCandidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  const nestedCandidates = [payload?.data, payload?.result, payload?.payload];

  for (const candidate of nestedCandidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    for (const key of ['customers', 'contacts', 'orders', 'data', 'results', 'records', 'items']) {
      if (Array.isArray(candidate[key])) {
        return candidate[key];
      }
    }
  }

  const deepCandidate = findCustomerArrayDeep(payload);
  if (deepCandidate) return deepCandidate;

  throw new Error(
    responsePath
      ? `External platform response did not contain an array at "${responsePath}".`
      : `External platform response did not contain a customer list.${describePayloadShape(payload)}`,
  );
}

async function readJsonResponse(response) {
  const text = await response.text();

  if (!text.trim()) return {};

  const contentType = response.headers.get('content-type') || '';

  if (/text\/html|application\/xhtml\+xml/i.test(contentType) || /^\s*<!doctype html/i.test(text)) {
    throw new Error(
      'Received HTML instead of JSON. This usually means the URL is the web app route, not the platform API route.',
    );
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Expected JSON response but received invalid JSON: ${text.slice(0, 200)}`);
  }
}

/**
 * Generic placeholder names that platforms use when no real name is available.
 * These should be ignored and the system should fall through to rawData extraction.
 */
const PLACEHOLDER_NAMES = new Set([
  'customer', 'customers', 'unnamed customer', 'unnamed', 'guest', 'guest user',
  'user', 'unknown', 'unknown customer', 'n/a', 'na', 'none', 'null',
  'no name', 'noname', 'anonymous', 'contact', 'buyer', 'client',
  'order', 'new customer', 'walk-in', 'walk in',
]);

function isPlaceholderName(value) {
  if (!value || typeof value !== 'string') return true;
  return PLACEHOLDER_NAMES.has(value.trim().toLowerCase());
}

function resolveRealName(...candidates) {
  for (const c of candidates) {
    if (c && typeof c === 'string' && c.trim() && !isPlaceholderName(c)) {
      return c.trim();
    }
  }
  return null;
}

/**
 * Extract the best available name from a raw platform record.
 * Covers direct fields, nested objects, and first+last combinations.
 */
function extractNameFromRaw(raw = {}) {
  // Direct string name fields in priority order
  const directFields = [
    raw.name,
    raw.full_name,
    raw.fullName,
    raw.customer_name,
    raw.customerName,
    raw.buyer_name,
    raw.buyerName,
    raw.contact_name,
    raw.contactName,
    raw.whatsapp_name,
    raw.whatsappName,
    raw.recipient_name,
    raw.recipientName,
    raw.billing_name,
    raw.billingName,
    raw.shipping_name,
    raw.shippingName,
    raw.profile_name,
    raw.profileName,
    raw.order_name,
    raw.orderName,
    raw.client_name,
    raw.clientName,
    raw.display_name,
    raw.displayName,
    raw.user_name,
    raw.userName,
    raw.account_name,
    raw.accountName,
  ];

  // Try all direct fields, skipping generic placeholder names
  const directResult = resolveRealName(...directFields);
  if (directResult) return directResult;

  // Nested object fields
  const nestedSources = [
    raw.customerDetails,
    raw.customer_details,
    raw.customer,
    raw.customerInfo,
    raw.customer_info,
    raw.user,
    raw.contact,
    raw.shippingAddress,
    raw.shipping_address,
    raw.billingAddress,
    raw.billing_address,
    raw.default_address,
    raw.defaultAddress,
  ];

  for (const nested of nestedSources) {
    if (!nested || typeof nested !== 'object' || Array.isArray(nested)) continue;

    const nestedResult = resolveRealName(
      nested.name,
      nested.full_name,
      nested.fullName,
      nested.customer_name,
      nested.customerName,
      nested.buyer_name,
      nested.contact_name,
      nested.display_name,
    );
    if (nestedResult) return nestedResult;

    // first + last inside nested
    const nestedFirstLast = [
      nested.first_name,
      nested.last_name,
      nested.firstName,
      nested.lastName,
    ].filter(Boolean).map(String).map(s => s.trim()).filter(s => !isPlaceholderName(s));

    if (nestedFirstLast.length > 0) {
      return nestedFirstLast.join(' ');
    }
  }

  // Top-level first + last name
  const firstLastParts = [
    raw.first_name,
    raw.last_name,
    raw.firstName,
    raw.lastName,
  ].filter(Boolean).map(String).map(s => s.trim()).filter(s => !isPlaceholderName(s));

  if (firstLastParts.length > 0) {
    return firstLastParts.join(' ');
  }

  return null;
}

function normalizeCustomerRecord(raw, index = 0) {
  if (index === 0 && raw && typeof raw === 'object') {
    console.log('[RAW KEYS from platform]', Object.keys(raw));
    console.log('[RAW SAMPLE]', JSON.stringify(raw).slice(0, 800));
  }

  const customerDetails =
    raw?.customerDetails ||
    raw?.customer_details ||
    raw?.customer ||
    {};
  const shipping =
    raw?.shippingAddress ||
    raw?.shipping_address ||
    raw?.default_address ||
    raw?.defaultAddress ||
    raw?.billing_address ||
    raw?.billingAddress ||
    {};
  const billing =
    raw?.billingAddress ||
    raw?.billing_address ||
    {};

  const nestedAddress =
    raw?.address && typeof raw.address === 'object'
      ? raw.address
      : raw?.customer_address && typeof raw.customer_address === 'object'
        ? raw.customer_address
        : shipping || billing;

  const externalId = toTrimmedString(
    firstNonEmpty(
      raw?.id,
      raw?._id,
      raw?.orderId,
      raw?.order_id,
      raw?.orderNumber,
      raw?.order_number,
      raw?.customer_id,
      raw?.customerId,
      raw?.external_id,
      raw?.externalId,
      raw?.uuid,
      raw?.reference_id,
      raw?.referenceId,
    ),
  );

  // Use the dedicated name extractor for robust name resolution
  const resolvedName = extractNameFromRaw(raw);

  const purchase = extractPurchaseDetails(raw);

  return {
    externalId,
    name: resolvedName,
    email: toTrimmedString(
      firstNonEmpty(
        raw?.email,
        raw?.email_address,
        raw?.emailAddress,
        customerDetails?.email,
        shipping?.email,
        billing?.email,
      ),
    ),
    phone: toTrimmedString(
      firstNonEmpty(
        raw?.phone,
        raw?.phone_number,
        raw?.phoneNumber,
        raw?.mobile,
        raw?.customerPhone,
        raw?.whatsapp_number,
        raw?.whatsappNumber,
        raw?.contact_number,
        customerDetails?.phone,
        shipping?.phone,
        billing?.phone,
      ),
    ),
    address: normalizeAddressValue(
      firstNonEmpty(
        raw?.address,
        raw?.street_address,
        raw?.streetAddress,
        raw?.address_line_1,
        raw?.addressLine1,
        shipping?.addressLine1,
        shipping?.address_line_1,
        billing?.addressLine1,
        billing?.address_line_1,
        shipping?.address,
        shipping?.address1,
        shipping?.street,
        billing?.address,
        billing?.address1,
        billing?.street,
        nestedAddress,
      ),
    ),
    city: toTrimmedString(
      firstNonEmpty(raw?.city, raw?.town, shipping?.city, billing?.city, nestedAddress?.city),
    ),
    state: toTrimmedString(
      firstNonEmpty(
        raw?.state,
        raw?.province,
        raw?.region,
        shipping?.state,
        billing?.state,
        nestedAddress?.state,
      ),
    ),
    country: toTrimmedString(
      firstNonEmpty(
        raw?.country,
        raw?.country_code,
        raw?.countryCode,
        shipping?.country,
        billing?.country,
        nestedAddress?.country,
      ),
    ),
    postal_code: toTrimmedString(
      firstNonEmpty(
        raw?.postal_code,
        raw?.postalCode,
        raw?.zip,
        raw?.zip_code,
        raw?.zipcode,
        shipping?.postal_code,
        shipping?.postalCode,
        shipping?.zip,
        shipping?.pincode,
        billing?.postal_code,
        billing?.postalCode,
        billing?.zip,
        billing?.pincode,
        nestedAddress?.postal_code,
        nestedAddress?.postalCode,
      ),
    ),
    purchaseProduct: purchase.purchaseProduct,
    purchaseAmount: purchase.purchaseAmount,
    created_at: firstNonEmpty(raw?.created_at, raw?.createdAt, raw?.date_created, raw?.dateCreated) || null,
    updated_at: firstNonEmpty(raw?.updated_at, raw?.updatedAt, raw?.date_updated, raw?.dateUpdated) || null,
    rawData: raw || {},
    _rowIndex: index,
  };
}

function hydrateStoredCustomer(customer, index = 0) {
  let rawData = {};

  if (customer?.rawData) {
    try {
      rawData = JSON.parse(customer.rawData);
    } catch {
      rawData = {};
    }
  }

  const normalized = normalizeCustomerRecord(rawData, index);

  // Prefer stored DB value only if it is a real name (not a platform placeholder).
  // If DB has a generic placeholder like "Customer", fall back to rawData extraction.
  const storedName = isPlaceholderName(customer.name) ? null : (customer.name || null);
  return {
    ...normalized,
    externalId: customer.externalId || normalized.externalId,
    name: storedName || normalized.name,
    email: customer.email || normalized.email,
    phone: customer.phone || normalized.phone,
    address: customer.address || normalized.address,
    city: customer.city || normalized.city,
    state: customer.state || normalized.state,
    purchaseProduct: customer.purchaseProduct || normalized.purchaseProduct,
    purchaseAmount: customer.purchaseAmount != null
      ? String(customer.purchaseAmount)
      : normalized.purchaseAmount,
    created_at: normalized.created_at || customer.createdAt,
    updated_at: normalized.updated_at || customer.createdAt,
    rawData,
  };
}

function mapKeyRecord(record) {
  if (!record) return null;

  const { apiKey, ...safeRecord } = record;

  return {
    ...safeRecord,
    baseUrl: maskSensitiveUrl(safeRecord.baseUrl),
    exportPath: maskSensitiveUrl(safeRecord.exportPath),
    customerCount: safeRecord._count?.customers ?? safeRecord.customerCount ?? 0,
  };
}

function createRequestHeaders(record, config, headers = {}) {
  const finalHeaders = {
    Accept: 'application/json',
    ...headers,
  };

  switch (config.authMode) {
    case 'bearer':
      finalHeaders.Authorization = `Bearer ${record.apiKey}`;
      break;
    case 'authorization':
      finalHeaders.Authorization = record.apiKey;
      break;
    case 'x-api-key':
      finalHeaders['x-api-key'] = record.apiKey;
      break;
    case 'api-key':
      finalHeaders['api-key'] = record.apiKey;
      break;
    case 'apikey':
      finalHeaders.apikey = record.apiKey;
      break;
    case 'api_key':
      finalHeaders.api_key = record.apiKey;
      break;
    case 'apiKey':
      finalHeaders.apiKey = record.apiKey;
      break;
    case 'query-api-key':
    case 'query-key':
    case 'query-token':
      break;
    case 'auto':
    case 'both':
    default:
      finalHeaders.Authorization = `Bearer ${record.apiKey}`;
      finalHeaders['x-api-key'] = record.apiKey;
      break;
  }

  return finalHeaders;
}

function getAuthModesToTry(config) {
  const mode = normalizeAuthMode(config.authMode);
  const modesByPreference = {
    bearer: ['bearer'],
    'x-api-key': ['x-api-key'],
    both: ['both', 'bearer', 'authorization', 'x-api-key', 'api-key', 'apikey', 'api_key', 'apiKey', 'query-api-key', 'query-key', 'query-token'],
    auto: ['bearer', 'authorization', 'x-api-key', 'api-key', 'apikey', 'api_key', 'apiKey', 'both', 'query-api-key', 'query-key', 'query-token'],
  };
  return modesByPreference[mode] || modesByPreference.auto;
}

function createAuthenticatedUrl(url, record, config) {
  const nextUrl = new URL(url);

  switch (config.authMode) {
    case 'query-api-key':
      nextUrl.searchParams.set('api_key', record.apiKey);
      break;
    case 'query-key':
      nextUrl.searchParams.set('key', record.apiKey);
      break;
    case 'query-token':
      nextUrl.searchParams.set('token', record.apiKey);
      break;
    default:
      break;
  }

  return nextUrl.toString();
}

function createUrlWithParams(url, params = {}) {
  const nextUrl = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    nextUrl.searchParams.set(key, String(value));
  }
  return nextUrl.toString();
}

async function fetchPlatformPayload(url, record, config, options = {}) {
  const requestUrl = createAuthenticatedUrl(url, record, config);
  const response = await fetchImpl(requestUrl, {
    method: options.method || 'GET',
    headers: createRequestHeaders(record, config, options.headers),
  });

  if (!response.ok) {
    const body = await response.text();
    let message = `${response.status} ${response.statusText}`;

    if (body) {
      if (/^\s*<!doctype html/i.test(body) || /<html[\s>]/i.test(body)) {
        message = `${message}: received an HTML page instead of the JSON API response. Check the platform base URL and endpoint.`;
      } else {
        try {
          const parsed = JSON.parse(body);
          message = parsed?.error || parsed?.message || message;
        } catch {
          message = `${message}: ${body.slice(0, 200)}`;
        }
      }
    }

    const error = new Error(message);
    error.status = response.status;
    error.fatal = response.status === 401 || response.status === 403;
    throw error;
  }

  return readJsonResponse(response);
}

function resolvePagination(payload) {
  return payload?.pagination || payload?.data?.pagination || payload?.meta?.pagination || null;
}

function shouldPaginate(payload) {
  const pagination = resolvePagination(payload);
  if (!pagination) return false;

  const currentPage = Number(pagination.page || pagination.currentPage || 1);
  const totalPages = Number(pagination.pages || pagination.totalPages || 1);

  return Number.isFinite(currentPage) && Number.isFinite(totalPages) && totalPages > currentPage;
}

function isMissingApiKeyError(error) {
  return /api key is required|missing api key|api key missing/i.test(error?.message || '');
}

function isInvalidApiKeyError(error) {
  return /invalid api key|api key invalid/i.test(error?.message || '');
}

function shouldPreferFetchError(current, next) {
  if (!current) return true;
  if (isInvalidApiKeyError(next) && isMissingApiKeyError(current)) return true;
  if (next.fatal && !current.fatal) return true;
  return !current.fatal && next.status && !current.status;
}

function isDatabaseNoSpaceError(error) {
  const text = [
    error?.message,
    error?.meta?.message,
    error?.cause?.message,
  ]
    .filter(Boolean)
    .join(' ');
  return /no space left on device|errno 28|os errno 28/i.test(text);
}

function throwFriendlyDatabaseStorageError(error) {
  if (!isDatabaseNoSpaceError(error)) {
    throw error;
  }

  const friendlyError = new Error(
    'The database server is out of disk space while saving customer data. ' +
      'Free space on the MySQL temp drive, or move the MySQL temp directory to a drive with space, then try again.',
  );
  friendlyError.status = 507;
  throw friendlyError;
}

let ensurePlatformCustomerColumnsPromise = null;

async function ensurePlatformCustomerColumns() {
  if (!ensurePlatformCustomerColumnsPromise) {
    ensurePlatformCustomerColumnsPromise = (async () => {
      const columns = await prisma.$queryRawUnsafe(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'platform_customers'
          AND COLUMN_NAME IN ('purchaseProduct', 'purchaseAmount')
      `);
      const columnNames = new Set(columns.map((column) => column.COLUMN_NAME || column.column_name));
      const missingColumns = [];

      if (!columnNames.has('purchaseProduct')) {
        missingColumns.push('ADD COLUMN purchaseProduct VARCHAR(500) NULL');
      }
      if (!columnNames.has('purchaseAmount')) {
        missingColumns.push('ADD COLUMN purchaseAmount DECIMAL(12,2) NULL');
      }

      for (const clause of missingColumns) {
        try {
          await prisma.$executeRawUnsafe(`ALTER TABLE platform_customers ${clause}`);
        } catch (error) {
          if (!String(error.message).toLowerCase().includes('duplicate')) {
            throw error;
          }
        }
      }
    })().catch((error) => {
      ensurePlatformCustomerColumnsPromise = null;
      throw error;
    });
  }

  return ensurePlatformCustomerColumnsPromise;
}

async function fetchAllPaginatedResults(initialUrl, initialPayload, record, config, options = {}) {
  const pagination = resolvePagination(initialPayload) || {};
  const totalPages = Number(pagination.pages || pagination.totalPages || 1);
  const limit = Number(pagination.limit || config.limit || options.limit || 50);
  const items = [...resolveCustomerArray(initialPayload, config.responsePath)];

  if (!Number.isFinite(totalPages) || totalPages <= 1) {
    return items;
  }

  for (let page = 2; page <= totalPages; page += 1) {
    const pageUrl = createUrlWithParams(initialUrl, { page, limit });
    const payload = await fetchPlatformPayload(pageUrl, record, config, options);
    const nextItems = resolveCustomerArray(payload, config.responsePath);
    items.push(...nextItems);
  }

  return items;
}

async function fetchExternalCustomers(record, options = {}) {
  const config = resolveKeyFetchConfig(record, options);
  const urls = buildCandidateUrls(config);

  if (!urls.length) {
    throw new Error('No platform URL is configured for this API key.');
  }

  let lastError = null;
  let preferredError = null;

  for (const url of urls) {
    for (const authMode of getAuthModesToTry(config)) {
      const requestConfig = { ...config, authMode };

      try {
        const payload = await fetchPlatformPayload(url, record, requestConfig, options);
        const effectiveConfig = { ...requestConfig, candidatePaths: config.candidatePaths };
        const customers = shouldPaginate(payload)
          ? await fetchAllPaginatedResults(url, payload, record, effectiveConfig, options)
          : resolveCustomerArray(payload, effectiveConfig.responsePath);

        return {
          requestUrl: maskSensitiveUrl(url),
          customers,
          payload,
          config: effectiveConfig,
        };
      } catch (error) {
        lastError = error;

        if (shouldPreferFetchError(preferredError, error)) {
          preferredError = error;
        }

        if (!error.fatal) {
          break;
        }
      }
    }
  }

  const finalError = preferredError || lastError;
  const authFailure =
    finalError?.status === 401 || finalError?.status === 403 || isInvalidApiKeyError(finalError);
  const failureDetail = authFailure
    ? `The external platform rejected this API key. Check that the saved key belongs to ${config.platform || 'the selected platform'} and has customer/order export access. ${finalError?.message || ''}`
    : finalError?.message || '';
  const hostDetail =
    isPublicWebAppHost(config.baseUrl) && finalError?.status === 404
      ? ` The saved Platform Base URL (${config.baseUrl}) looks like the public Billzzy website, not the JSON API host. Use the API base URL provided by Billzzy/F3 for this store, then fetch again.`
      : '';

  const error = new Error(
    `Unable to fetch customer data from the external platform. ` +
      `Checked ${maskSensitiveUrls(urls).join(', ')}. ${maskSecretText(failureDetail)}${hostDetail}`.trim(),
  );
  error.status = authFailure ? 401 : 502;
  error.externalStatus = finalError?.status || null;
  throw error;
}

async function replaceStoredCustomers(scoringApiKeyId, customers) {
  await ensurePlatformCustomerColumns();

  try {
    await prisma.platformCustomer.deleteMany({
      where: { scoringApiKeyId },
    });
  } catch (error) {
    throwFriendlyDatabaseStorageError(error);
  }

  if (!customers.length) return 0;

  let createResult;

  try {
    createResult = await prisma.platformCustomer.createMany({
      data: customers.map((customer) => ({
        scoringApiKeyId,
        externalId: customer.externalId || null,
        name: customer.name || null,
        email: customer.email || null,
        phone: customer.phone || null,
        address: customer.address || null,
        city: customer.city || null,
        state: customer.state || null,
        purchaseProduct: customer.purchaseProduct || null,
        purchaseAmount: customer.purchaseAmount || null,
        rawData: JSON.stringify(customer.rawData || {}),
      })),
      skipDuplicates: true,
    });
  } catch (error) {
    throwFriendlyDatabaseStorageError(error);
  }

  return createResult.count || customers.length;
}

async function saveApiKeyToDb({
  api_key,
  label,
  platform,
  platformKey,
  baseUrl,
  exportPath,
  authMode,
  responsePath,
}) {
  const apiKey = String(api_key || '').trim();
  const storeName = toTrimmedString(label);
  const platformBaseUrl = sanitizeBaseUrl(baseUrl);
  const platformEndpoints = sanitizeExportPathList(exportPath);

  if (!storeName) {
    const error = new Error('Store name is required.');
    error.status = 400;
    throw error;
  }

  if (!platformBaseUrl) {
    const error = new Error('Platform Base URL is required.');
    error.status = 400;
    throw error;
  }

  if (!platformEndpoints) {
    const error = new Error('API Endpoints are required.');
    error.status = 400;
    throw error;
  }

  const existingKeys = await prisma.scoringApiKey.findMany({
    select: { id: true, apiKey: true, label: true },
  });
  const normalizedStoreName = storeName.toLowerCase();
  const existingStore = existingKeys.find(
    (record) => String(record.label || '').trim().toLowerCase() === normalizedStoreName,
  );

  if (existingStore) {
    const error = new Error(`An API key is already saved for store "${storeName}". Delete that store key before saving a replacement.`);
    error.status = 409;
    throw error;
  }

  const existingApiKey = existingKeys.find((record) => String(record.apiKey || '').trim() === apiKey);

  if (existingApiKey) {
    const error = new Error(`This API key is already saved for store "${existingApiKey.label || existingApiKey.id}".`);
    error.status = 409;
    throw error;
  }

  const config = buildConfigFromInput({
    apiKey,
    label: storeName,
    platform,
    platformKey,
    baseUrl: platformBaseUrl,
    exportPath: platformEndpoints,
    authMode,
    responsePath,
  });

  const record = await prisma.scoringApiKey.create({
    data: {
      apiKey,
      apiKeyPreview: maskApiKey(apiKey),
      label: storeName,
      platform: config.platform,
      platformKey: config.platformKey,
      baseUrl: platformBaseUrl,
      exportPath: platformEndpoints,
      authMode: config.authMode,
      responsePath: config.responsePath,
      status: 'saved',
    },
  });

  return record;
}

async function fetchCustomersWithApiKey(id, options = {}) {
  const record = await prisma.scoringApiKey.findUnique({
    where: { id: Number(id) },
  });

  if (!record) throw new Error('API key not found');

  await prisma.scoringApiKey.update({
    where: { id: record.id },
    data: { status: 'fetching' },
  });

  try {
    const fetched = await fetchExternalCustomers(record, options);
    const normalizedCustomers = fetched.customers.map((customer, index) =>
      normalizeCustomerRecord(customer, index),
    );
    const savedCount = await replaceStoredCustomers(record.id, normalizedCustomers);

    await prisma.scoringApiKey.update({
      where: { id: record.id },
      data: { status: 'fetched' },
    });

    return {
      total: normalizedCustomers.length,
      savedCount,
      requestUrl: fetched.requestUrl,
      customers: normalizedCustomers,
      config: fetched.config,
    };
  } catch (error) {
    await prisma.scoringApiKey.update({
      where: { id: record.id },
      data: { status: 'failed' },
    });
    throw error;
  }
}

async function getCustomersByKeyId(id) {
  const customers = await prisma.platformCustomer.findMany({
    where: { scoringApiKeyId: Number(id) },
    orderBy: { createdAt: 'desc' },
  });

  return customers.map((customer, index) => {
    const hydrated = hydrateStoredCustomer(customer, index);
    // If DB has a placeholder name (e.g. "Customer"), trust rawData extraction instead
    const resolvedName = isPlaceholderName(customer.name) ? null : (customer.name || null);
    return {
      ...customer,
      name:            resolvedName             || hydrated.name            || null,
      email:           customer.email           || hydrated.email           || null,
      phone:           customer.phone           || hydrated.phone           || null,
      address:         customer.address         || hydrated.address         || null,
      city:            customer.city            || hydrated.city            || null,
      state:           customer.state           || hydrated.state           || null,
      purchaseProduct: customer.purchaseProduct || hydrated.purchaseProduct || null,
      purchaseAmount:  customer.purchaseAmount  != null ? customer.purchaseAmount : (hydrated.purchaseAmount ?? null),
      details:         hydrated,
    };
  });
}

async function scoreCustomersForApiKey(id) {
  const record = await prisma.scoringApiKey.findUnique({
    where: { id: Number(id) },
    include: {
      customers: { orderBy: { createdAt: 'desc' } },
      _count: { select: { customers: true } },
    },
  });

  if (!record) throw new Error('API key not found');

  const normalizedCustomers = record.customers.map((customer, index) =>
    hydrateStoredCustomer(customer, index),
  );
  const score = scoreAddressRecords(normalizedCustomers);

  const updatedRecord = await prisma.scoringApiKey.update({
    where: { id: record.id },
    data: { status: 'scored', band: score.score_band },
    include: { _count: { select: { customers: true } } },
  });

  return {
    key: mapKeyRecord(updatedRecord),
    score,
    total: normalizedCustomers.length,
    customers: normalizedCustomers,
  };
}

async function fetchAndScoreCustomersWithApiKey(id, options = {}) {
  const fetched = await fetchCustomersWithApiKey(id, options);
  const score = scoreAddressRecords(fetched.customers);

  const updatedRecord = await prisma.scoringApiKey.update({
    where: { id: Number(id) },
    data: { status: 'scored', band: score.score_band },
    include: { _count: { select: { customers: true } } },
  });

  return {
    key: mapKeyRecord(updatedRecord),
    requestUrl: fetched.requestUrl,
    total: fetched.total,
    savedCount: fetched.savedCount,
    score,
    customers: fetched.customers,
    config: fetched.config,
  };
}

async function getAllApiKeys({ page = 1, limit = 20, band, status } = {}) {
  const where = {};
  if (band) where.band = band;
  if (status) where.status = status;

  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    prisma.scoringApiKey.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { customers: true } } },
    }),
    prisma.scoringApiKey.count({ where }),
  ]);

  return { data: data.map(mapKeyRecord), total, page, limit };
}

async function getApiKeyDetail(id) {
  const record = await prisma.scoringApiKey.findUnique({
    where: { id: Number(id) },
    include: {
      customers: true,
      _count: { select: { customers: true } },
    },
  });
  return mapKeyRecord(record);
}

async function deleteApiKeyById(id) {
  return prisma.scoringApiKey.delete({ where: { id: Number(id) } });
}

async function getScoreDistribution() {
  const rows = await prisma.scoringApiKey.groupBy({
    by: ['band'],
    _count: { band: true },
  });
  return rows.map((row) => ({ band: row.band, count: row._count.band }));
}

async function processApiKey(api_key, label, onProgress, options = {}) {
  onProgress({ stage: 'Saving key...', fetched: 0, total: 3 });
  const record = await saveApiKeyToDb({
    api_key,
    label,
    platform: options.platform || DEFAULT_PLATFORM,
    platformKey: options.platformKey || 'custom',
    baseUrl: options.baseUrl,
    exportPath: options.exportPath,
    authMode: options.authMode,
    responsePath: options.responsePath,
  });

  onProgress({ stage: 'Fetching customers...', fetched: 1, total: 3 });
  const fetched = await fetchCustomersWithApiKey(record.id, options);

  onProgress({ stage: 'Scoring customers...', fetched: 2, total: 3 });
  const score = scoreAddressRecords(fetched.customers);

  const updatedRecord = await prisma.scoringApiKey.update({
    where: { id: record.id },
    data: { status: 'scored', band: score.score_band },
  });

  onProgress({ stage: 'Done', fetched: 3, total: 3 });

  return { key: mapKeyRecord(updatedRecord), total: fetched.total, score };
}

module.exports = {
  PLATFORM_PRESETS,
  saveApiKeyToDb,
  fetchCustomersWithApiKey,
  getCustomersByKeyId,
  scoreCustomersForApiKey,
  fetchAndScoreCustomersWithApiKey,
  getAllApiKeys,
  getApiKeyDetail,
  deleteApiKeyById,
  getScoreDistribution,
  processApiKey,
};