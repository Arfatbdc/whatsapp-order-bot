"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getToolDefinitions = getToolDefinitions;
function numericLikeProperty(description) {
    return {
        anyOf: [
            { type: 'number' },
            {
                type: 'string',
                pattern: '^-?\\d+(\\.\\d+)?$',
            },
        ],
        description,
    };
}
/**
 * Tool definitions in OpenAI function-calling format.
 */
function getToolDefinitions() {
    return [
        {
            type: 'function',
            function: {
                name: 'get_store_info',
                description: 'Get store information: working hours, delivery zones, delivery fees, minimum order, payment methods. Call this when customer asks about store details.',
                parameters: { type: 'object', properties: {}, required: [] },
            },
        },
        {
            type: 'function',
            function: {
                name: 'search_products',
                description: 'Search for products by name or keyword. Use this when customer asks for a specific product or mentions a product name. Returns a list of matching products with prices.',
                parameters: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: 'Product name or keyword to search for (in Arabic or English)',
                        },
                        category_id: {
                            type: 'string',
                            description: 'Optional: filter by category UUID',
                        },
                        limit: numericLikeProperty('Max results to return (default 10)'),
                    },
                    required: ['query'],
                },
            },
        },
        {
            type: 'function',
            function: {
                name: 'browse_categories',
                description: 'Get all product categories with product counts. Call this when customer asks "what do you have", "show me your products", or wants to browse.',
                parameters: { type: 'object', properties: {}, required: [] },
            },
        },
        {
            type: 'function',
            function: {
                name: 'get_product_details',
                description: 'Get detailed info about a specific product including description and alternatives if out of stock.',
                parameters: {
                    type: 'object',
                    properties: {
                        product_id: {
                            type: 'string',
                            description: 'The UUID of the product',
                        },
                    },
                    required: ['product_id'],
                },
            },
        },
        {
            type: 'function',
            function: {
                name: 'check_stock',
                description: 'Check if a product is in stock and how much quantity is available.',
                parameters: {
                    type: 'object',
                    properties: {
                        product_id: {
                            type: 'string',
                            description: 'The UUID of the product',
                        },
                        quantity: numericLikeProperty('Quantity the customer wants'),
                    },
                    required: ['product_id', 'quantity'],
                },
            },
        },
        {
            type: 'function',
            function: {
                name: 'add_to_cart',
                description: "Add a product to the customer's cart. Call this after confirming which product the customer wants.",
                parameters: {
                    type: 'object',
                    properties: {
                        product_id: {
                            type: 'string',
                            description: 'The UUID of the product to add',
                        },
                        quantity: numericLikeProperty('Quantity to add (use decimal for weight, e.g. 0.5 for half kg)'),
                    },
                    required: ['product_id', 'quantity'],
                },
            },
        },
        {
            type: 'function',
            function: {
                name: 'remove_from_cart',
                description: 'Remove a product from the cart.',
                parameters: {
                    type: 'object',
                    properties: {
                        product_id: {
                            type: 'string',
                            description: 'The UUID of the product to remove',
                        },
                    },
                    required: ['product_id'],
                },
            },
        },
        {
            type: 'function',
            function: {
                name: 'update_cart_quantity',
                description: 'Update the quantity of an item already in the cart. Use quantity=0 to remove.',
                parameters: {
                    type: 'object',
                    properties: {
                        product_id: {
                            type: 'string',
                            description: 'The UUID of the product',
                        },
                        quantity: numericLikeProperty('New quantity (0 to remove)'),
                    },
                    required: ['product_id', 'quantity'],
                },
            },
        },
        {
            type: 'function',
            function: {
                name: 'view_cart',
                description: "Get the current cart contents with totals. Call this when customer asks to see their cart.",
                parameters: { type: 'object', properties: {}, required: [] },
            },
        },
        {
            type: 'function',
            function: {
                name: 'clear_cart',
                description: 'Empty the entire cart. Ask for confirmation before calling this.',
                parameters: { type: 'object', properties: {}, required: [] },
            },
        },
    ];
}
//# sourceMappingURL=tools.js.map