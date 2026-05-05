import Redis from 'ioredis';
import { logger } from '../utils/logger';

let redis: Redis;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) {
          logger.warn('Redis max retries reached — stopping reconnection');
          return null; // stop retrying
        }
        return Math.min(times * 200, 5000);
      },
      lazyConnect: true,
    });

    redis.on('connect', () => {
      logger.info('Redis connected');
    });

    redis.on('error', (err) => {
      logger.error({ err }, 'Redis error');
    });

    redis.on('close', () => {
      logger.warn('Redis connection closed');
    });
  }

  return redis;
}

// Conversation context helpers — store last N messages per customer
const CONVERSATION_TTL = 60 * 60 * 24; // 24 hours
const MAX_CONTEXT_MESSAGES = 20;

export async function getConversationContext(
  storeId: string,
  customerId: string
): Promise<string[]> {
  const key = `conv:${storeId}:${customerId}`;
  const messages = await getRedis().lrange(key, 0, MAX_CONTEXT_MESSAGES - 1);
  return messages;
}

export async function addConversationMessage(
  storeId: string,
  customerId: string,
  message: string
): Promise<void> {
  const key = `conv:${storeId}:${customerId}`;
  const r = getRedis();
  await r.lpush(key, message);
  await r.ltrim(key, 0, MAX_CONTEXT_MESSAGES - 1);
  await r.expire(key, CONVERSATION_TTL);
}

export async function clearConversationContext(
  storeId: string,
  customerId: string
): Promise<void> {
  const key = `conv:${storeId}:${customerId}`;
  await getRedis().del(key);
}

// Rate limiting helpers
export async function checkRateLimit(
  identifier: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  const key = `ratelimit:${identifier}`;
  const r = getRedis();

  const current = await r.incr(key);
  if (current === 1) {
    await r.expire(key, windowSeconds);
  }

  return {
    allowed: current <= maxRequests,
    remaining: Math.max(0, maxRequests - current),
  };
}

// Cart cache (fast reads, DB is source of truth)
const CART_TTL = 60 * 60 * 24; // 24 hours

export async function cacheCart(customerId: string, cart: object): Promise<void> {
  const key = `cart:${customerId}`;
  await getRedis().setex(key, CART_TTL, JSON.stringify(cart));
}

export async function getCachedCart(customerId: string): Promise<object | null> {
  const key = `cart:${customerId}`;
  const data = await getRedis().get(key);
  return data ? JSON.parse(data) : null;
}

export async function invalidateCartCache(customerId: string): Promise<void> {
  await getRedis().del(`cart:${customerId}`);
}

export async function connectRedis(): Promise<boolean> {
  try {
    await getRedis().connect();
    logger.info('Redis connection successful');
    return true;
  } catch (err) {
    logger.error({ err }, 'Redis connection failed');
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    logger.info('Redis connection closed');
  }
}
