import dotenv from 'dotenv';
import path from 'path';
import { AppConfig } from '../types';

// override: true ensures .env values take priority over system env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function requireAnyEnv(keys: string[]): string {
  for (const key of keys) {
    if (process.env[key]) {
      return process.env[key] as string;
    }
  }
  throw new Error(`Missing required environment variable: ${keys.join(' or ')}`);
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export const config: AppConfig = {
  port: parseInt(optionalEnv('PORT', '3000'), 10),
  nodeEnv: optionalEnv('NODE_ENV', 'development'),

  databaseUrl: requireEnv('DATABASE_URL'),
  redisUrl: optionalEnv('REDIS_URL', 'redis://localhost:6379'),

  meta: {
    verifyToken: requireEnv('META_VERIFY_TOKEN'),
    appSecret: requireEnv('META_APP_SECRET'),
  },

  ai: {
    apiKey: requireAnyEnv(['GROQ_API_KEY', 'OPENAI_API_KEY']),
    model: optionalEnv('AI_MODEL', 'llama-3.3-70b-versatile'),
    maxTokens: parseInt(optionalEnv('AI_MAX_TOKENS', '1000'), 10),
    temperature: parseFloat(optionalEnv('AI_TEMPERATURE', '0.3')),
  },

  payment: {
    moyasarApiKey: optionalEnv('MOYASAR_API_KEY', ''),
    moyasarPublishableKey: optionalEnv('MOYASAR_PUBLISHABLE_KEY', ''),
  },

  jwt: {
    secret: requireEnv('JWT_SECRET'),
  },

  encryption: {
    key: requireEnv('ENCRYPTION_KEY'),
  },
};

export function isProduction(): boolean {
  return config.nodeEnv === 'production';
}

export function isDevelopment(): boolean {
  return config.nodeEnv === 'development';
}
