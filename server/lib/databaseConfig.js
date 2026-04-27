require('dotenv').config();

const DEFAULT_DB_PORT = 3306;
const DEFAULT_CONNECTION_LIMIT = 10;

const ensureMySqlConnectionLimit = (databaseUrl, minimumLimit = DEFAULT_CONNECTION_LIMIT) => {
  if (!databaseUrl) return databaseUrl;

  try {
    const parsed = new URL(databaseUrl);
    if (parsed.protocol !== 'mysql:') return databaseUrl;

    const currentLimit = Number(parsed.searchParams.get('connection_limit') || 0);
    if (!currentLimit || currentLimit < minimumLimit) {
      parsed.searchParams.set('connection_limit', String(minimumLimit));
    }

    return parsed.toString();
  } catch {
    return databaseUrl;
  }
};

const buildDatabaseUrlFromEnv = () => {
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const name = process.env.DB_NAME;
  if (!host || !user || !name) return null;

  const password = process.env.DB_PASSWORD || '';
  const port = process.env.DB_PORT || String(DEFAULT_DB_PORT);
  const db = String(name).trim();
  const encodedUser = encodeURIComponent(user);
  const encodedPass = encodeURIComponent(password);
  const auth = password ? `${encodedUser}:${encodedPass}` : encodedUser;

  return `mysql://${auth}@${host}:${port}/${db}?connection_limit=${DEFAULT_CONNECTION_LIMIT}`;
};

const resolveDatabaseUrl = () => {
  const explicitDatabaseUrl = typeof process.env.DATABASE_URL === 'string'
    ? process.env.DATABASE_URL.trim()
    : '';

  if (explicitDatabaseUrl) {
    return ensureMySqlConnectionLimit(explicitDatabaseUrl, DEFAULT_CONNECTION_LIMIT);
  }

  return ensureMySqlConnectionLimit(buildDatabaseUrlFromEnv(), DEFAULT_CONNECTION_LIMIT);
};

const parseDatabaseUrl = (databaseUrl) => {
  if (!databaseUrl) return null;

  try {
    const parsed = new URL(databaseUrl);
    if (parsed.protocol !== 'mysql:') return null;

    const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    const connectionLimit = Number(parsed.searchParams.get('connection_limit') || DEFAULT_CONNECTION_LIMIT);

    return {
      host: parsed.hostname || process.env.DB_HOST || 'localhost',
      user: decodeURIComponent(parsed.username || process.env.DB_USER || 'root'),
      password: decodeURIComponent(parsed.password || process.env.DB_PASSWORD || ''),
      port: Number(parsed.port || process.env.DB_PORT || DEFAULT_DB_PORT),
      database: database || (process.env.DB_NAME ? String(process.env.DB_NAME).trim() : 'client_data'),
      connectionLimit: Number.isFinite(connectionLimit) && connectionLimit > 0
        ? connectionLimit
        : DEFAULT_CONNECTION_LIMIT
    };
  } catch {
    return null;
  }
};

const getConfiguredDatabaseName = () => {
  const parsed = parseDatabaseUrl(resolveDatabaseUrl());
  if (parsed?.database) return parsed.database;

  const fallbackName = typeof process.env.DB_NAME === 'string'
    ? process.env.DB_NAME.trim()
    : '';

  return fallbackName || null;
};

const getMysqlServerConnectionOptions = () => {
  const parsed = parseDatabaseUrl(resolveDatabaseUrl());

  return {
    host: parsed?.host || process.env.DB_HOST || 'localhost',
    user: parsed?.user || process.env.DB_USER || 'root',
    password: parsed?.password || process.env.DB_PASSWORD || '',
    port: parsed?.port || Number(process.env.DB_PORT || DEFAULT_DB_PORT)
  };
};

const getMysqlDatabaseConnectionOptions = () => ({
  ...getMysqlServerConnectionOptions(),
  database: getConfiguredDatabaseName() || 'client_data'
});

const getMysqlPoolOptions = () => {
  const parsed = parseDatabaseUrl(resolveDatabaseUrl());

  return {
    ...getMysqlDatabaseConnectionOptions(),
    waitForConnections: true,
    connectionLimit: parsed?.connectionLimit || DEFAULT_CONNECTION_LIMIT,
    queueLimit: 0
  };
};

module.exports = {
  buildDatabaseUrlFromEnv,
  ensureMySqlConnectionLimit,
  getConfiguredDatabaseName,
  getMysqlDatabaseConnectionOptions,
  getMysqlPoolOptions,
  getMysqlServerConnectionOptions,
  parseDatabaseUrl,
  resolveDatabaseUrl
};
