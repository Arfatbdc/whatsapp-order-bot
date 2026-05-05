import axios from 'axios';
import { AIContext, AIResponse, ButtonData, ConversationMessage, ToolContext } from '../types';
import { buildSystemPrompt } from './prompts';
import { getToolDefinitions } from './tools';
import { ToolRouter } from './toolRouter';
import { logger } from '../utils/logger';

const MAX_TOOL_ITERATIONS = 5;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const FALLBACK_MODELS = [
  'llama3-70b-8192',
  'llama-3.1-8b-instant',
  'gemma2-9b-it',
];

// ─── Button IDs (must match catalogFlow BTN constants) ──────────────────────
const BTN = {
  BROWSE:        'menu_browse',
  CART:          'menu_cart',
  CART_CHECKOUT: 'cart_checkout',
  CART_ADD:      'cart_add_more',
  MAIN_MENU:     'back_main',
  TRACK_ORDER:   'track_order',
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface OAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OAIToolCall[];
  tool_call_id?: string;
}

interface OAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface GroqErrorData {
  error?: {
    message?: string;
    type?: string;
    code?: string;
    failed_generation?: string;
  };
}

interface ParsedFailedToolCall {
  toolName: string;
  args: Record<string, unknown>;
}

/** Context collected while tools run in one AI turn */
interface ToolRunContext {
  toolsUsed: string[];
  cartItemCount: number;   // number of items in cart after last cart op
  addedToCart: boolean;    // true if add_to_cart succeeded this turn
  viewedCart: boolean;
  searchedProducts: boolean;
  productsFound: number;
}

// ─── Main Engine ─────────────────────────────────────────────────────────────

export class AIEngine {
  private apiKey: string;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(apiKey: string, model: string, maxTokens: number, temperature = 0.2) {
    this.apiKey = apiKey;
    this.model = model;
    this.maxTokens = maxTokens;
    this.temperature = temperature;
  }

  async processMessage(ctx: AIContext): Promise<AIResponse> {
    const systemPrompt = buildSystemPrompt(ctx.store, ctx.customer, ctx.currentCart);
    const tools = getToolDefinitions();

    const toolCtx: ToolContext = {
      storeId: ctx.store.id,
      customerId: ctx.customer.id,
      language: ctx.customer.language || 'ar',
      customerPhone: ctx.customer.phone,
    };
    const router = new ToolRouter(toolCtx);

    const messages: OAIMessage[] = [
      { role: 'system', content: systemPrompt },
      ...this.historyToMessages(ctx.conversationHistory),
      { role: 'user', content: ctx.userMessage },
    ];

    const modelsToTry = [this.model, ...FALLBACK_MODELS.filter((m) => m !== this.model)];

    for (const model of modelsToTry) {
      const result = await this.tryModel(model, messages, tools, router, ctx);

      if (result.success) {
        return result.response!;
      }

      if (!result.retryable) {
        break;
      }

      logger.warn({ failedModel: model }, 'Groq model unavailable - trying fallback');
    }

    const language = ctx.customer.language || 'ar';
    return this.errorResponse(language);
  }

  private async tryModel(
    model: string,
    initialMessages: OAIMessage[],
    tools: ReturnType<typeof getToolDefinitions>,
    router: ToolRouter,
    ctx: AIContext
  ): Promise<{ success: boolean; response?: AIResponse; retryable: boolean }> {
    logger.info({ model }, 'Calling Groq model');

    const messages = [...initialMessages];
    let iterations = 0;
    let finalText = '';
    let toolsEnabled = true;

    // Track what happened during tool execution so we can build smart UI
    const runCtx: ToolRunContext = {
      toolsUsed: [],
      cartItemCount: ctx.currentCart?.items?.length ?? 0,
      addedToCart: false,
      viewedCart: false,
      searchedProducts: false,
      productsFound: 0,
    };

    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations++;

      let response;
      try {
        const payload: Record<string, unknown> = {
          model,
          max_tokens: this.maxTokens,
          temperature: this.temperature,
          messages,
        };

        if (toolsEnabled) {
          payload.tools = tools;
          payload.tool_choice = 'auto';
        }

        response = await axios.post(GROQ_URL, payload, {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        });
      } catch (err: unknown) {
        const axiosErr = err as { response?: { status?: number; data?: unknown }; message?: string };
        const status = axiosErr.response?.status;
        const errorData = (axiosErr.response?.data || {}) as GroqErrorData;
        const errorCode = errorData.error?.code;

        if (status === 400 && errorCode === 'tool_use_failed' && toolsEnabled) {
          const parsedCall = this.parseFailedGenerationToolCall(errorData.error?.failed_generation);

          if (parsedCall) {
            logger.warn(
              { model, iteration: iterations, toolName: parsedCall.toolName },
              'Groq emitted malformed tool call - executing recovered tool call locally'
            );

            const toolResult = await router.executeTool(parsedCall.toolName, parsedCall.args);
            this.updateRunCtx(runCtx, parsedCall.toolName, toolResult);

            messages.push({
              role: 'assistant',
              content: `Attempted tool call: ${parsedCall.toolName}(${JSON.stringify(parsedCall.args)})`,
            });
            messages.push({
              role: 'system',
              content:
                `Recovered tool result for ${parsedCall.toolName}: ` +
                `${JSON.stringify(toolResult)}. Use this data to answer accurately.`,
            });
            toolsEnabled = false;
            continue;
          }

          logger.warn(
            { model, iteration: iterations, err: errorData.error || axiosErr.message },
            'Groq tool validation failed - retrying once without tools'
          );
          toolsEnabled = false;
          continue;
        }

        logger.error(
          {
            model,
            status,
            errorCode,
            err: errorData.error || axiosErr.message,
            iteration: iterations,
            toolsEnabled,
          },
          'Groq API call failed'
        );

        const retryable = status === 429 || status === 503 || status === 404;
        return { success: false, retryable };
      }

      const choice = response.data?.choices?.[0];
      const message = choice?.message;
      const finishReason = choice?.finish_reason;

      if (!message) {
        logger.error({ model, responseData: response.data }, 'Empty response from Groq');
        return { success: false, retryable: true };
      }

      logger.debug({ model, finishReason, iteration: iterations, toolsEnabled }, 'Groq response received');

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

      for (const toolCall of message.tool_calls as OAIToolCall[]) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(toolCall.function.arguments || '{}');
        } catch {
          logger.warn(
            { tool: toolCall.function.name, args: toolCall.function.arguments },
            'Failed to parse tool arguments'
          );
        }

        const result = await router.executeTool(toolCall.function.name, args);
        this.updateRunCtx(runCtx, toolCall.function.name, result);
        logger.debug({ toolName: toolCall.function.name }, 'Tool executed');

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

    const language = ctx.customer.language || 'ar';
    logger.info({ model, responseLength: finalText.length, ...runCtx }, 'AI response generated successfully');

    // Build a smart interactive response with follow-up buttons
    const aiResponse = this.buildSmartResponse(finalText, language, runCtx);

    return {
      success: true,
      response: aiResponse,
      retryable: false,
    };
  }

  // ─── Smart Response Builder ─────────────────────────────────────────────────

  /**
   * Turn plain AI text into an interactive WhatsApp response.
   *
   * Strategy:
   *  - Short text (≤ 800 chars) → single `buttons` message (text in body)
   *  - Long text                → `text` message + `followUp` buttons message
   *
   * Button set depends on what tools were used this turn:
   *  - add_to_cart success → [View Order 🍽️] [Checkout ✅] [Browse More 🔍]
   *  - view_cart with items → [Checkout ✅] [Add More 🔍] [Main Menu 🏠]
   *  - search found results → [Browse Menu 🍽️] [My Order 🍽️]
   *  - default              → [Browse Menu 🍽️] [My Order 🍽️] [Main Menu 🏠]
   */
  private buildSmartResponse(text: string, lang: string, runCtx: ToolRunContext): AIResponse {
    const buttons = this.buildContextualButtons(lang, runCtx);
    const MAX_BODY = 800;

    if (!buttons || buttons.length === 0) {
      return { text, language: lang, suggestedUI: 'text' };
    }

    const btnData: ButtonData = {
      body: text.length <= MAX_BODY ? text : '—',
      buttons,
      footer: lang === 'ar' ? 'اختر الخطوة التالية 👇' : 'Choose next step 👇',
    };

    // Short text → inline buttons message
    if (text.length <= MAX_BODY) {
      return {
        text,
        language: lang,
        suggestedUI: 'buttons',
        buttons: btnData,
      };
    }

    // Long text → text first, then buttons follow-up
    const followUpBody = lang === 'ar' ? 'ماذا تريد الآن؟' : 'What would you like to do next?';
    return {
      text,
      language: lang,
      suggestedUI: 'text',
      followUp: {
        text: followUpBody,
        language: lang,
        suggestedUI: 'buttons',
        buttons: { ...btnData, body: followUpBody },
      },
    };
  }

  /**
   * Pick the right 2-3 buttons based on what happened in this AI turn.
   * WhatsApp max is 3 buttons. Button titles max 20 chars.
   */
  private buildContextualButtons(
    lang: string,
    runCtx: ToolRunContext
  ): { id: string; title: string }[] {
    const ar = lang === 'ar';

    if (runCtx.addedToCart) {
      // Just added something → nudge toward checkout or continue shopping
      const btns: { id: string; title: string }[] = [
        { id: BTN.CART,          title: ar ? 'طلبي 🍽️'          : 'My Order 🍽️'   },
        { id: BTN.CART_CHECKOUT, title: ar ? 'إتمام الطلب ✅'     : 'Checkout ✅'    },
        { id: BTN.BROWSE,        title: ar ? 'تصفح القائمة 🍽️'  : 'Browse More 🍽️' },
      ];
      return btns;
    }

    if (runCtx.viewedCart) {
      if (runCtx.cartItemCount > 0) {
        return [
          { id: BTN.CART_CHECKOUT, title: ar ? 'إتمام الطلب ✅'     : 'Checkout ✅'   },
          { id: BTN.BROWSE,        title: ar ? 'إضافة أصناف 🍽️'    : 'Add Items 🍽️' },
          { id: BTN.MAIN_MENU,     title: ar ? 'القائمة الرئيسية 🏠' : 'Main Menu 🏠' },
        ];
      }
      // Empty cart
      return [
        { id: BTN.BROWSE,    title: ar ? 'تصفح القائمة 🍽️'  : 'Browse Menu 🍽️' },
        { id: BTN.MAIN_MENU, title: ar ? 'القائمة الرئيسية 🏠' : 'Main Menu 🏠'    },
      ];
    }

    if (runCtx.searchedProducts) {
      const btns: { id: string; title: string }[] = [
        { id: BTN.BROWSE, title: ar ? 'تصفح القائمة 🍽️' : 'Browse Menu 🍽️' },
      ];
      if (runCtx.cartItemCount > 0) {
        btns.push({ id: BTN.CART, title: ar ? 'طلبي 🍽️' : 'My Order 🍽️' });
      }
      btns.push({ id: BTN.MAIN_MENU, title: ar ? 'القائمة الرئيسية 🏠' : 'Main Menu 🏠' });
      return btns.slice(0, 3);
    }

    // Default navigation — always show these so the user is never stuck
    const defaults: { id: string; title: string }[] = [
      { id: BTN.BROWSE, title: ar ? 'تصفح القائمة 🍽️' : 'Browse Menu 🍽️' },
    ];

    if (runCtx.cartItemCount > 0) {
      defaults.push({ id: BTN.CART_CHECKOUT, title: ar ? 'إتمام الطلب ✅' : 'Checkout ✅' });
    } else {
      defaults.push({ id: BTN.CART, title: ar ? 'طلبي 🍽️' : 'My Order 🍽️' });
    }

    defaults.push({ id: BTN.MAIN_MENU, title: ar ? 'القائمة الرئيسية 🏠' : 'Main Menu 🏠' });
    return defaults.slice(0, 3);
  }

  /**
   * Update ToolRunContext after each tool execution.
   */
  private updateRunCtx(
    runCtx: ToolRunContext,
    toolName: string,
    result: unknown
  ): void {
    runCtx.toolsUsed.push(toolName);

    const res = result as Record<string, unknown>;

    if (toolName === 'add_to_cart') {
      if (res?.success === true) {
        runCtx.addedToCart = true;
        const cart = res.cart as Record<string, unknown> | undefined;
        if (typeof cart?.item_count === 'number') {
          runCtx.cartItemCount = cart.item_count;
        }
      }
    }

    if (toolName === 'view_cart') {
      runCtx.viewedCart = true;
      const items = res?.items as unknown[] | undefined;
      if (Array.isArray(items)) {
        runCtx.cartItemCount = items.length;
      } else if (res?.empty === true) {
        runCtx.cartItemCount = 0;
      }
    }

    if (toolName === 'remove_from_cart' || toolName === 'update_cart_quantity' || toolName === 'clear_cart') {
      const cart = res?.cart as Record<string, unknown> | undefined;
      if (typeof cart?.item_count === 'number') {
        runCtx.cartItemCount = cart.item_count;
      }
    }

    if (toolName === 'search_products') {
      runCtx.searchedProducts = true;
      if (typeof res?.found === 'number') {
        runCtx.productsFound = res.found;
      }
    }
  }

  // ─── Error / Fallback Responses ────────────────────────────────────────────

  private errorResponse(language: string): AIResponse {
    const ar = language === 'ar';
    const body = ar
      ? 'عذرًا، حصل خطأ تقني. حاول مرة ثانية أو تواصل مع المتجر مباشرة.'
      : 'Sorry, a technical error occurred. Please try again.';
    return {
      text: body,
      language,
      suggestedUI: 'buttons',
      buttons: {
        body,
        buttons: [
          { id: BTN.BROWSE,    title: ar ? 'تصفح القائمة 🍽️'  : 'Browse Menu 🍽️' },
          { id: BTN.MAIN_MENU, title: ar ? 'القائمة الرئيسية 🏠' : 'Main Menu 🏠'    },
        ],
      },
    };
  }

  // ─── Parsing helpers ────────────────────────────────────────────────────────

  private parseFailedGenerationToolCall(failedGeneration?: string): ParsedFailedToolCall | null {
    if (!failedGeneration) return null;

    const match = failedGeneration.match(/<function=([^>]+)>([\s\S]*?)<\/function>/i);
    if (!match) return null;

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

    let args: Record<string, unknown> = {};
    if (argsJson) {
      try {
        args = JSON.parse(argsJson);
      } catch {
        return null;
      }
    }

    return { toolName, args };
  }

  private historyToMessages(history: ConversationMessage[]): OAIMessage[] {
    return history
      .filter((msg) => msg.role !== 'system')
      .map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }));
  }
}
