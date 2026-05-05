"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolRouter = void 0;
const product_1 = require("../services/product");
const formatters_1 = require("../utils/formatters");
const logger_1 = require("../utils/logger");
/**
 * Dispatches Claude tool calls to the appropriate service methods.
 * Returns plain objects/strings that Claude receives as the tool_result.
 *
 * Day 3: fully implements product catalog tools.
 * Days 4-5 will add cart and order tools.
 */
class ToolRouter {
    context;
    constructor(context) {
        this.context = context;
    }
    async executeTool(toolName, toolInput) {
        logger_1.logger.debug({ toolName, toolInput }, 'Executing tool');
        try {
            switch (toolName) {
                // â”€â”€â”€ Store Info â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
                case 'get_store_info':
                    return {
                        success: true,
                        note: 'Store info is already in your system prompt. Use it to answer the customer.',
                    };
                // â”€â”€â”€ Product Catalog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
                case 'search_products':
                    return this.searchProducts(toolInput);
                case 'browse_categories':
                    return this.browseCategories();
                case 'get_product_details':
                    return this.getProductDetails(toolInput);
                case 'check_stock':
                    return this.checkStock(toolInput);
                // â”€â”€â”€ Cart (implemented Day 4) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
                case 'add_to_cart':
                case 'remove_from_cart':
                case 'update_cart_quantity':
                case 'view_cart':
                case 'clear_cart':
                    return {
                        success: false,
                        error: 'cart_not_implemented',
                        message_ar: 'ط®ط¯ظ…ط© ط§ظ„ط³ظ„ط© ط³طھظƒظˆظ† ظ…طھط§ط­ط© ظ‚ط±ظٹط¨ط§ظ‹.',
                        message_en: 'Cart service coming soon.',
                    };
                default:
                    logger_1.logger.warn({ toolName }, 'Unknown tool called');
                    return { error: `Unknown tool: ${toolName}` };
            }
        }
        catch (err) {
            logger_1.logger.error({ err, toolName }, 'Tool execution failed');
            return {
                error: 'tool_execution_failed',
                message_ar: 'ط¹ط°ط±ط§ظ‹طŒ ط­طµظ„ ط®ط·ط£ طھظ‚ظ†ظٹ.',
                message_en: 'A technical error occurred.',
            };
        }
    }
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // PRODUCT TOOLS
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    async searchProducts(input) {
        const q = String(input.query || '').trim();
        if (!q) {
            return { success: false, error: 'query_required', message: 'Please provide a search term.' };
        }
        const rawLimit = input.limit;
        const parsedLimit = typeof rawLimit === 'number' ? rawLimit : Number(String(rawLimit ?? '').trim());
        const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : 10;
        const { products, total } = await product_1.ProductService.search(this.context.storeId, q, {
            categoryId: input.category_id,
            limit,
        });
        if (total === 0) {
            return {
                success: true,
                found: 0,
                message_ar: `ط¹ط°ط±ط§ظ‹طŒ ظ„ظ… ط£ط¬ط¯ ظ…ظ†طھط¬ط§طھ طھط·ط§ط¨ظ‚ "${q}". ظ…ظ…ظƒظ† طھط¹ط·ظٹظ†ظٹ ط§ط³ظ… ط«ط§ظ†ظٹ ط£ظˆ ط£ط¹ط±ط¶ ظ„ظƒ ط§ظ„ط£ظ‚ط³ط§ظ… ط§ظ„ظ…طھظˆظپط±ط©طں`,
                message_en: `Sorry, no products found matching "${q}". Try a different name or browse categories?`,
            };
        }
        const lang = this.context.language;
        const formatted = (0, formatters_1.formatProductList)(products, lang);
        // Return both the formatted display string AND structured data
        // so Claude can present it clearly and also reference product IDs
        return {
            success: true,
            found: total,
            display: formatted,
            products: products.map((p) => ({
                id: p.id,
                name: lang === 'ar' ? p.name_ar : (p.name_en || p.name_ar),
                price: p.price,
                price_display: (0, formatters_1.formatPrice)(p.price, lang),
                unit: (0, formatters_1.formatUnit)(p.unit, lang),
                in_stock: p.in_stock,
                category_id: p.category_id,
            })),
        };
    }
    async browseCategories() {
        const categories = await product_1.ProductService.getCategories(this.context.storeId);
        if (categories.length === 0) {
            return {
                success: true,
                found: 0,
                message_ar: 'ظ„ط§ طھظˆط¬ط¯ ط£ظ‚ط³ط§ظ… ظ…طھط§ط­ط© ط­ط§ظ„ظٹط§ظ‹.',
                message_en: 'No categories available at the moment.',
            };
        }
        const lang = this.context.language;
        const formatted = (0, formatters_1.formatCategoryList)(categories, lang);
        return {
            success: true,
            found: categories.length,
            display: formatted,
            categories: categories.map((c) => ({
                id: c.id,
                name: lang === 'ar' ? c.name_ar : (c.name_en || c.name_ar),
                product_count: c.product_count || 0,
            })),
        };
    }
    async getProductDetails(input) {
        const productId = String(input.product_id || '').trim();
        if (!productId) {
            return { success: false, error: 'product_id_required' };
        }
        const product = await product_1.ProductService.getById(this.context.storeId, productId);
        if (!product) {
            return {
                success: false,
                error: 'not_found',
                message_ar: 'ط§ظ„ظ…ظ†طھط¬ ط؛ظٹط± ظ…ظˆط¬ظˆط¯.',
                message_en: 'Product not found.',
            };
        }
        const lang = this.context.language;
        const display = (0, formatters_1.formatProductDetails)(product, lang);
        let alternatives = [];
        if (!product.in_stock) {
            const alts = await product_1.ProductService.getAlternatives(this.context.storeId, productId);
            alternatives = alts.map((a) => ({
                id: a.id,
                name: lang === 'ar' ? a.name_ar : (a.name_en || a.name_ar),
                price_display: (0, formatters_1.formatPrice)(a.price, lang),
                in_stock: a.in_stock,
            }));
        }
        return {
            success: true,
            display,
            product: {
                id: product.id,
                name: lang === 'ar' ? product.name_ar : (product.name_en || product.name_ar),
                price: product.price,
                price_display: (0, formatters_1.formatPrice)(product.price, lang),
                unit: (0, formatters_1.formatUnit)(product.unit, lang),
                in_stock: product.in_stock,
                stock_qty: product.stock_qty,
            },
            alternatives,
        };
    }
    async checkStock(input) {
        const productId = String(input.product_id || '').trim();
        const quantity = Number(input.quantity) || 1;
        const { inStock, availableQty, product } = await product_1.ProductService.checkStock(this.context.storeId, productId, quantity);
        if (!product) {
            return { success: false, error: 'not_found' };
        }
        const lang = this.context.language;
        const name = lang === 'ar' ? product.name_ar : (product.name_en || product.name_ar);
        return {
            success: true,
            product_id: productId,
            name,
            in_stock: inStock,
            requested_qty: quantity,
            available_qty: availableQty,
            message_ar: inStock
                ? `âœ… ${name} ظ…طھظˆظپط±`
                : `â‌Œ ${name} ط؛ظٹط± ظ…طھظˆظپط± ط¨ط§ظ„ظƒظ…ظٹط© ط§ظ„ظ…ط·ظ„ظˆط¨ط©${availableQty !== null ? ` (ظ…طھظˆظپط±: ${availableQty})` : ''}`,
            message_en: inStock
                ? `âœ… ${name} is in stock`
                : `â‌Œ ${name} is not available in the requested quantity${availableQty !== null ? ` (available: ${availableQty})` : ''}`,
        };
    }
}
exports.ToolRouter = ToolRouter;
//# sourceMappingURL=toolRouter.js.map