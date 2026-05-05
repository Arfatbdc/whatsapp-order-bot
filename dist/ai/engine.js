"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIEngine = void 0;
const axios_1 = __importDefault(require("axios"));
const prompts_1 = require("./prompts");
const tools_1 = require("./tools");
const toolRouter_1 = require("./toolRouter");
const logger_1 = require("../utils/logger");
const MAX_TOOL_ITERATIONS = 5;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const FALLBACK_MODELS = [
    'llama3-70b-8192',
    'llama-3.1-8b-instant',
    'gemma2-9b-it',
];
class AIEngine {
    apiKey;
    model;
    maxTokens;
    temperature;
    constructor(apiKey, model, maxTokens, temperature = 0.2) {
        this.apiKey = apiKey;
        this.model = model;
        this.maxTokens = maxTokens;
        this.temperature = temperature;
    }
    async processMessage(ctx) {
        const systemPrompt = (0, prompts_1.buildSystemPrompt)(ctx.store, ctx.customer, ctx.currentCart);
        const tools = (0, tools_1.getToolDefinitions)();
        const toolCtx = {
            storeId: ctx.store.id,
            customerId: ctx.customer.id,
            language: ctx.customer.language || 'ar',
            customerPhone: ctx.customer.phone,
        };
        const router = new toolRouter_1.ToolRouter(toolCtx);
        const messages = [
            { role: 'system', content: systemPrompt },
            ...this.historyToMessages(ctx.conversationHistory),
            { role: 'user', content: ctx.userMessage },
        ];
        const modelsToTry = [this.model, ...FALLBACK_MODELS.filter((m) => m !== this.model)];
        for (const model of modelsToTry) {
            const result = await this.tryModel(model, messages, tools, router, ctx);
            if (result.success) {
                return result.response;
            }
            if (!result.retryable) {
                break;
            }
            logger_1.logger.warn({ failedModel: model }, 'Groq model unavailable - trying fallback');
        }
        const language = ctx.customer.language || 'ar';
        return {
            text: language === 'ar'
                ? 'عذرًا، حصل خطأ تقني. حاول مرة ثانية أو تواصل مع المتجر مباشرة.'
                : 'Sorry, a technical error occurred. Please try again.',
            language,
            suggestedUI: 'text',
        };
    }
    async tryModel(model, initialMessages, tools, router, ctx) {
        logger_1.logger.info({ model }, 'Calling Groq model');
        const messages = [...initialMessages];
        let iterations = 0;
        let finalText = '';
        let toolsEnabled = true;
        while (iterations < MAX_TOOL_ITERATIONS) {
            iterations++;
            let response;
            try {
                const payload = {
                    model,
                    max_tokens: this.maxTokens,
                    temperature: this.temperature,
                    messages,
                };
                if (toolsEnabled) {
                    payload.tools = tools;
                    payload.tool_choice = 'auto';
                }
                response = await axios_1.default.post(GROQ_URL, payload, {
                    headers: {
                        Authorization: `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: 30000,
                });
            }
            catch (err) {
                const axiosErr = err;
                const status = axiosErr.response?.status;
                const errorData = (axiosErr.response?.data || {});
                const errorCode = errorData.error?.code;
                if (status === 400 && errorCode === 'tool_use_failed' && toolsEnabled) {
                    const parsedCall = this.parseFailedGenerationToolCall(errorData.error?.failed_generation);
                    if (parsedCall) {
                        logger_1.logger.warn({ model, iteration: iterations, toolName: parsedCall.toolName }, 'Groq emitted malformed tool call - executing recovered tool call locally');
                        const toolResult = await router.executeTool(parsedCall.toolName, parsedCall.args);
                        messages.push({
                            role: 'assistant',
                            content: `Attempted tool call: ${parsedCall.toolName}(${JSON.stringify(parsedCall.args)})`,
                        });
                        messages.push({
                            role: 'system',
                            content: `Recovered tool result for ${parsedCall.toolName}: ` +
                                `${JSON.stringify(toolResult)}. Use this data to answer accurately.`,
                        });
                        toolsEnabled = false;
                        continue;
                    }
                    logger_1.logger.warn({ model, iteration: iterations, err: errorData.error || axiosErr.message }, 'Groq tool validation failed - retrying once without tools');
                    toolsEnabled = false;
                    continue;
                }
                logger_1.logger.error({
                    model,
                    status,
                    errorCode,
                    err: errorData.error || axiosErr.message,
                    iteration: iterations,
                    toolsEnabled,
                }, 'Groq API call failed');
                const retryable = status === 429 || status === 503 || status === 404;
                return { success: false, retryable };
            }
            const choice = response.data?.choices?.[0];
            const message = choice?.message;
            const finishReason = choice?.finish_reason;
            if (!message) {
                logger_1.logger.error({ model, responseData: response.data }, 'Empty response from Groq');
                return { success: false, retryable: true };
            }
            logger_1.logger.debug({ model, finishReason, iteration: iterations, toolsEnabled }, 'Groq response received');
            if (message.content) {
                finalText = message.content;
            }
            if (finishReason === 'stop' || !message.tool_calls?.length || !toolsEnabled) {
                break;
            }
            messages.push({
                role: 'assistant',
                content: message.content || null,
                tool_calls: message.tool_calls,
            });
            for (const toolCall of message.tool_calls) {
                let args = {};
                try {
                    args = JSON.parse(toolCall.function.arguments || '{}');
                }
                catch {
                    logger_1.logger.warn({ tool: toolCall.function.name, args: toolCall.function.arguments }, 'Failed to parse tool arguments');
                }
                const result = await router.executeTool(toolCall.function.name, args);
                logger_1.logger.debug({ toolName: toolCall.function.name }, 'Tool executed');
                messages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: JSON.stringify(result),
                });
            }
        }
        if (!finalText) {
            const language = ctx.customer.language || 'ar';
            finalText =
                language === 'ar'
                    ? 'عذرًا، ما قدرت أفهم طلبك. ممكن توضح أكثر؟'
                    : "Sorry, I couldn't understand your request. Could you clarify?";
        }
        logger_1.logger.info({ model, responseLength: finalText.length }, 'AI response generated successfully');
        return {
            success: true,
            response: {
                text: finalText,
                language: ctx.customer.language || 'ar',
                suggestedUI: 'text',
            },
            retryable: false,
        };
    }
    parseFailedGenerationToolCall(failedGeneration) {
        if (!failedGeneration)
            return null;
        const match = failedGeneration.match(/<function=([^>]+)>([\s\S]*?)<\/function>/i);
        if (!match)
            return null;
        const rawHeader = match[1].trim();
        const rawBody = (match[2] || '').trim();
        let toolName = rawHeader;
        let argsJson = rawBody;
        const headerEqIndex = rawHeader.indexOf('=');
        if (headerEqIndex > 0) {
            toolName = rawHeader.slice(0, headerEqIndex).trim();
            if (!argsJson) {
                argsJson = rawHeader.slice(headerEqIndex + 1).trim();
            }
        }
        if (!toolName || !/^[a-zA-Z0-9_]+$/.test(toolName)) {
            return null;
        }
        let args = {};
        if (argsJson) {
            try {
                args = JSON.parse(argsJson);
            }
            catch {
                return null;
            }
        }
        return { toolName, args };
    }
    historyToMessages(history) {
        return history
            .filter((msg) => msg.role !== 'system')
            .map((msg) => ({
            role: msg.role,
            content: msg.content,
        }));
    }
}
exports.AIEngine = AIEngine;
//# sourceMappingURL=engine.js.map