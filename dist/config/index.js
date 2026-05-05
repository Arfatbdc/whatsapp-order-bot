"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.isProduction = isProduction;
exports.isDevelopment = isDevelopment;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// override: true ensures .env values take priority over system env vars
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), '.env'), override: true });
function requireEnv(key) {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
}
function optionalEnv(key, fallback) {
    return process.env[key] || fallback;
}
exports.config = {
    port: parseInt(optionalEnv('PORT', '3000'), 10),
    nodeEnv: optionalEnv('NODE_ENV', 'development'),
    databaseUrl: requireEnv('DATABASE_URL'),
    redisUrl: optionalEnv('REDIS_URL', 'redis://localhost:6379'),
    meta: {
        verifyToken: requireEnv('META_VERIFY_TOKEN'),
        appSecret: requireEnv('META_APP_SECRET'),
    },
    ai: {
        apiKey: requireEnv('GROQ_API_KEY'),
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
function isProduction() {
    return exports.config.nodeEnv === 'production';
}
function isDevelopment() {
    return exports.config.nodeEnv === 'development';
}
//# sourceMappingURL=index.js.map