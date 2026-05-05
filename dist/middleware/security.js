"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookRateLimit = void 0;
exports.applySecurityMiddleware = applySecurityMiddleware;
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
function applySecurityMiddleware(app) {
    // Helmet — sets various HTTP security headers
    app.use((0, helmet_1.default)());
    // CORS — restrictive in production
    app.use((0, cors_1.default)({
        origin: process.env.NODE_ENV === 'production'
            ? process.env.CORS_ORIGIN || false
            : true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true,
    }));
    // Global rate limiter — 1000 requests/min across all endpoints
    app.use((0, express_rate_limit_1.default)({
        windowMs: 60 * 1000,
        max: 1000,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Too many requests, please try again later' },
        skip: (req) => {
            // Don't rate limit the webhook verification GET
            return req.method === 'GET' && req.path === '/webhook';
        },
    }));
    // WhatsApp webhook gets its own stricter per-user rate limiting
    // (applied per phone number in the webhook route handler)
}
// Per-user rate limiter for WhatsApp messages: 30 msgs/min
exports.webhookRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 30,
    keyGenerator: (req) => {
        // Extract phone from WhatsApp webhook body
        try {
            const body = req.body;
            const phone = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;
            return phone || req.ip || 'unknown';
        }
        catch {
            return req.ip || 'unknown';
        }
    },
    standardHeaders: false,
    legacyHeaders: false,
    message: { error: 'Rate limit exceeded' },
});
//# sourceMappingURL=security.js.map