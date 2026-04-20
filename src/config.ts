import { config as loadEnv } from 'dotenv';

loadEnv();

function getEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  port: parseInt(getEnv('PORT', '8000'), 10),
  host: getEnv('HOST', '0.0.0.0'),
  nodeEnv: getEnv('NODE_ENV', 'development'),
  logLevel: getEnv('LOG_LEVEL', 'info'),
};
