import { config as loadEnv } from 'dotenv';
import { parseMinIntervalSeconds } from 'tricount-actual-sync';

loadEnv();

function getEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  port: parseInt(getEnv('PORT', '8000'), 10),
  host: getEnv('HOST', '0.0.0.0'),
  nodeEnv: getEnv('NODE_ENV', 'development'),
  logLevel: getEnv('LOG_LEVEL', 'info'),
  upstreamTimeoutMs: parseInt(getEnv('UPSTREAM_TIMEOUT_MS', '5000'), 10),
  dogCeoBaseUrl: getEnv('DOG_CEO_BASE_URL', 'https://dog.ceo/api'),
  actualApiUrl: getEnv('ACTUAL_API_URL', 'http://localhost:3000'),
  homeCurrency: getEnv('HOME_CURRENCY', 'EUR'),
  // Shared with every other process talking to Tricount (the CLI, the other
  // home-api instance): one device, one rate limiter.
  tricountSessionDir: getEnv('TRICOUNT_SESSION_DIR', 'data/tricount-session'),
  // Holds tricounts.json; one per instance.
  tricountConfigDir: getEnv('TRICOUNT_CONFIG_DIR', 'data/tricount-config'),
  tricountMinIntervalSeconds: parseMinIntervalSeconds(process.env.TRICOUNT_MIN_INTERVAL_SECONDS),
};
