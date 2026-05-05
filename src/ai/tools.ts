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

function numericLikeProperty(description: string): Record<string, unknown> {
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
export function getToolDefinitions(): OpenAITool[] {
  return [
    {
      type: 'function',
      function: {
        name: 'get_store_info',
        description:
          'Get restaurant information: working hours, delivery zones, delivery fees, minimum order, payment methods. Call this when customer asks about restaurant details.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },

    {
      type: 'function',
      function: {
        name: 'search_products',
        description:
          'Search for menu items / dishes by name or keyword. Use this when customer asks for a specific dish or mentions a food item. Returns a list of matching menu items with prices.',
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
        description:
          'Get all menu categories (starters, main dishes, grills, desserts, beverages, etc.) with item counts. Call this when customer asks "what do you have", "show me the menu", or wants to browse food categories.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_product_details',
        description:
          'Get detailed info about a specific menu item including description, ingredients, and alternatives if unavailable.',
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
        description:
          "Add a menu item to the customer's order. Call this after confirming which dish the customer wants. Optionally pass special_instructions for customization (no onions, extra spicy, etc.)",
        parameters: {
          type: 'object',
          properties: {
            product_id: {
              type: 'string',
              description: 'The UUID of the menu item to add',
            },
            quantity: numericLikeProperty('Number of portions to add'),
            special_instructions: {
              type: 'string',
              description: 'Optional customization note, e.g. "no onions", "extra spicy", "well done"',
            },
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
        description:
          "Get the current cart contents with totals. Call this when customer asks to see their cart.",
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

    // ── Day 6: Promotions ───────────────────────────────────────────────────
    {
      type: 'function',
      function: {
        name: 'get_active_promotions',
        description:
          'Get all currently active promotions and offers. Call this when customer asks about discounts, promo codes, or special offers.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'apply_promo_code',
        description:
          'Validate and apply a promo code to the order. Call this when customer provides a promo code.',
        parameters: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'The promo code string entered by the customer',
            },
          },
          required: ['code'],
        },
      },
    },

    // ── Day 9: Subscriptions & Reorder ────────────────────────────────────────
    {
      type: 'function',
      function: {
        name: 'reorder_last_order',
        description:
          "Re-add all items from the customer's last order to the current cart. Call this when customer says 'reorder', 'same as last time', 'كرر طلبي', 'نفس الطلب'.",
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_subscriptions',
        description:
          "Get the customer's active recurring meal subscriptions. Call this when customer asks about their subscriptions.",
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'create_subscription',
        description:
          "Create a recurring meal subscription using the current cart items. Call this when customer wants to schedule automatic weekly/biweekly/monthly orders.",
        parameters: {
          type: 'object',
          properties: {
            frequency: {
              type: 'string',
              enum: ['weekly', 'biweekly', 'monthly'],
              description: 'How often to repeat the order',
            },
            delivery_day: {
              type: 'string',
              description: 'Day of the week for delivery (e.g. saturday, sunday, monday)',
            },
          },
          required: ['frequency', 'delivery_day'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'manage_subscription',
        description:
          "Pause, resume, or cancel a recurring subscription. Call this when customer wants to modify their subscription.",
        parameters: {
          type: 'object',
          properties: {
            subscription_id: {
              type: 'string',
              description: 'The UUID of the subscription to manage',
            },
            action: {
              type: 'string',
              enum: ['pause', 'resume', 'cancel'],
              description: 'Action to perform on the subscription',
            },
          },
          required: ['subscription_id', 'action'],
        },
      },
    },
  ];
}
