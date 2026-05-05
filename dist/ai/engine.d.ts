import { AIContext, AIResponse } from '../types';
export declare class AIEngine {
    private apiKey;
    private model;
    private maxTokens;
    private temperature;
    constructor(apiKey: string, model: string, maxTokens: number, temperature?: number);
    processMessage(ctx: AIContext): Promise<AIResponse>;
    private tryModel;
    private parseFailedGenerationToolCall;
    private historyToMessages;
}
//# sourceMappingURL=engine.d.ts.map