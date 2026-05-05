"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRedis = getRedis;
exports.getConversationContext = getConversationContext;
exports.addConversationMessage = addConversationMessage;
exports.clearConversationContext = clearConversationContext;
exports.checkRateLimit = checkRateLimit;
exports.cacheCart = cacheCart;
exports.getCachedCart = getCachedCart;
exports.invalidateCartCache = invalidateCartCache;
exports.connectRedis = connectRedis;
exports.closeRedis = closeRedis;
const ioredis_1 = __importDefault(require("ioredis"));
const logger_1 = require("../utils/logger");
let redis;
function getRedis() {
    if (!redis) {
        redis = new ioredis_1.default(process.env.REDIS_URL || 'redis://localhost:6379', {
            maxRetriesPerRequest: 3,
            retryStrategy(times) {
                if (times > 3) {
                    logger_1.logger.warn('Redis max retries reached — stopping reconnection');
                    return null; // stop retrying
                }
                return Math.min(times * 200, 5000);
            },
            lazyConnect: true,
        });
        redis.on('connect', () => {
            logger_1.logger.info('Redis connected');
        });
        redis.on('error', (err) => {
            logger_1.logger.error({ err }, 'Redis error');
        });
        redis.on('close', () => {
            logger_1.logger.warn('Redis connection closed');
        });
    }
    return redis;
}
// Conversation context helpers — store last N messages per customer
const CONVERSATION_TTL = 60 * 60 * 24; // 24 hours
const MAX_CONTEXT_MESSAGES = 20;
async function getConversationContext(storeId, customerId) {
    const key = `conv:${storeId}:${customerId}`;
    const messages = await getRedis().lrange(key, 0, MAX_CONTEXT_MESSAGES - 1);
    return messages;
}
async function addConversationMessage(storeId, customerId, message) {
    const key = `conv:${storeId}:${customerId}`;
    const r = getRedis();
    await r.lpush(key, message);
    await r.ltrim(key, 0, MAX_CONTEXT_MESSAGES - 1);
    await r.expire(key, CONVERSATION_TTL);
}
async function clearConversationContext(storeId, customerId) {
    const key = `conv:${storeId}:${customerId}`;
    await getRedis().del(key);
}
// Rate limiting helpers
async function checkRateLimit(identifier, maxRequests, windowSeconds) {
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
async function cacheCart(customerId, cart) {
    const key = `cart:${customerId}`;
    await getRedis().setex(key, CART_TTL, JSON.stringify(cart));
}
async function getCachedCart(customerId) {
    const key = `cart:${customerId}`;
    const data = await getRedis().get(key);
    return data ? JSON.parse(data) : null;
}
async function invalidateCartCache(customerId) {
    await getRedis().del(`cart:${customerId}`);
}
async function connectRedis() {
    try {
        await getRedis().connect();
        logger_1.logger.info('Redis connection successful');
        return true;
    }
    catch (err) {
        logger_1.logger.error({ err }, 'Redis connection failed');
        return false;
    }
}
async function closeRedis() {
    if (redis) {
        await redis.quit();
        logger_1.logger.info('Redis connection closed');
    }
}
//# sourceMappingURL=redis.js.map