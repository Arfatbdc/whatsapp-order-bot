import { ToolContext } from '../types';
/**
 * Dispatches Claude tool calls to the appropriate service methods.
 * Returns plain objects/strings that Claude receives as the tool_result.
 *
 * Day 3: fully implements product catalog tools.
 * Days 4-5 will add cart and order tools.
 */
export declare class ToolRouter {
    private context;
    constructor(context: ToolContext);
    executeTool(toolName: string, toolInput: Record<string, unknown>): Promise<unknown>;
    private searchProducts;
    private browseCategories;
    private getProductDetails;
    private checkStock;
}
//# sourceMappingURL=toolRouter.d.ts.map