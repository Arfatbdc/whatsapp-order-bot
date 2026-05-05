export interface OpenAITool {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: {
            type: 'object';
            properties: Record<string, unknown>;
            required: string[];
        };
    };
}
/**
 * Tool definitions in OpenAI function-calling format.
 */
export declare function getToolDefinitions(): OpenAITool[];
//# sourceMappingURL=tools.d.ts.map