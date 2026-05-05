import Redis from 'ioredis';
export declare function getRedis(): Redis;
export declare function getConversationContext(storeId: string, customerId: string): Promise<string[]>;
export declare function addConversationMessage(storeId: string, customerId: string, message: string): Promise<void>;
export declare function clearConversationContext(storeId: string, customerId: string): Promise<void>;
export declare function checkRateLimit(identifier: string, maxRequests: number, windowSeconds: number): Promise<{
    allowed: boolean;
    remaining: number;
}>;
export declare function cacheCart(customerId: string, cart: object): Promise<void>;
export declare function getCachedCart(customerId: string): Promise<object | null>;
export declare function invalidateCartCache(customerId: string): Promise<void>;
export declare function connectRedis(): Promise<boolean>;
export declare function closeRedis(): Promise<void>;
//# sourceMappingURL=redis.d.ts.map