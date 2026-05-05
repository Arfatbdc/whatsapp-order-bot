"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppError = void 0;
exports.errorHandler = errorHandler;
exports.notFoundHandler = notFoundHandler;
const logger_1 = require("../utils/logger");
class AppError extends Error {
    statusCode;
    isOperational;
    constructor(statusCode, message, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        Object.setPrototypeOf(this, AppError.prototype);
    }
}
exports.AppError = AppError;
function errorHandler(err, _req, res, _next) {
    if (err instanceof AppError) {
        logger_1.logger.warn({ statusCode: err.statusCode, message: err.message }, 'Operational error');
        res.status(err.statusCode).json({
            error: err.message,
        });
        return;
    }
    // Unexpected errors
    logger_1.logger.error({ err }, 'Unhandled error');
    res.status(500).json({
        error: process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : err.message,
    });
}
function notFoundHandler(req, res) {
    res.status(404).json({
        error: `Route ${req.method} ${req.path} not found`,
    });
}
//# sourceMappingURL=errorHandler.js.map