/**
 * Jest test setup — configures environment for unit tests.
 * Mocks database and Redis so tests run without real infrastructure.
 */
import dotenv from 'dotenv';
import path from 'path';

// Load .env.test if it exists, fall back to .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Mock pg pool so tests don't need a real DB
jest.mock('../src/database/connection', () => ({
  queryOne: jest.fn(),
  query: jest.fn().mockResolvedValue([]),
  getPool: jest.fn().mockReturnValue({ connect: jest.fn() }),
}));

// Mock Redis so tests don't need a real Redis
jest.mock('../src/database/redis', () => ({
  getRedis: jest.fn(),
  cacheCart: jest.fn().mockResolvedValue(undefined),
  getCachedCart: jest.fn().mockResolvedValue(null),
  invalidateCartCache: jest.fn().mockResolvedValue(undefined),
  connectRedis: jest.fn().mockResolvedValue(true),
  closeRedis: jest.fn().mockResolvedValue(undefined),
}));
