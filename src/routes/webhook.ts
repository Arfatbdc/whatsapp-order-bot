import { Router, Request, Response } from 'express';
import { config } from '../config';
import { validateWebhookSignature } from '../middleware/webhookAuth';
import { webhookRateLimit } from '../middleware/security';
import { findStoreByPhoneId, WhatsAppService } from '../services/whatsapp';
import { CustomerService } from '../services/customer';
import { ConversationManager } from '../services/conversation';
import { SessionService } from '../services/session';
import { CartService } from '../services/cart';
import { AIEngine } from '../ai/engine';
import { CatalogFlow } from '../ai/catalogFlow';
import { FallbackRouter } from '../ai/fallback';
import { AnalyticsService } from '../services/analytics';
import { getRedis } from '../database/redis';
import { logger } from '../utils/logger';
import {
  WhatsAppWebhookBody,
  WhatsAppMessage,
  WhatsAppContact,
  Store,
  ConversationMessage,
} from '../types';

const router = Router();

// Singleton AI engine — reused across requests
const aiEngine = new AIEngine(
  config.ai.apiKey,
  config.ai.model,
  config.ai.maxTokens,
  config.ai.temperature
);

// ═══════════════════════════════════════════
// GET /webhook — Meta verification handshake
// ═══════════════════════════════════════════

router.get('/', (req: Request, res: Response): void => {
  const mode      = req.query['hub.mode'] as string;
  const token     = req.query['hub.verify_token'] as string;
  const challenge = req.query['hub.challenge'] as string;

  if (mode === 'subscribe' && token === config.meta.verifyToken) {
    logger.info('Webhook verified successfully');
    res.status(200).send(challenge);
    return;
  }

  logger.warn({ mode, token: token?.substring(0, 5) + '...' }, 'Webhook verification failed');
  res.status(403).json({ error: 'Verification failed' });
});

// ═══════════════════════════════════════════
// POST /webhook — Incoming messages from Meta
// ═══════════════════════════════════════════

router.post(
  '/',
  validateWebhookSignature(config.meta.appSecret),
  webhookRateLimit,
  async (req: Request, res: Response): Promise<void> => {
    // Always respond 200 quickly — Meta retries on non-200
    res.status(200).json({ status: 'received' });

    try {
      const body = req.body as WhatsAppWebhookBody;
      if (body.object !== 'whatsapp_business_account') return;

      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (change.field !== 'messages') continue;

          const value = change.value;
          const phoneNumberId = value.metadata.phone_number_id;

          const store = await findStoreByPhoneId(phoneNumberId);
          if (!store) {
            logger.warn({ phoneNumberId }, 'Received message for unknown store');
            continue;
          }

          if (value.messages?.length) {
            for (const message of value.messages) {
              const contact = value.contacts?.find((c) => c.wa_id === message.from) ?? null;
              await processMessage(store, message, contact);
            }
          }

          if (value.statuses) {
            for (const status of value.statuses) {
              logger.debug(
                { messageId: status.id, status: status.status, to: status.recipient_id },
                'Message status update'
              );
            }
          }
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error processing webhook');
    }
  }
);

// ═══════════════════════════════════════════
// MESSAGE PROCESSING PIPELINE
//
// Priority order (backend-first):
//  1. CatalogFlow  — buttons, lists, greetings, search (no AI needed)
//  2. FallbackRouter — keyword patterns when AI is unavailable
//  3. AI Engine   — open-ended conversation
//  4. FallbackRouter.handleAIFailure — if AI throws
// ═══════════════════════════════════════════

async function processMessage(
  store: Store,
  message: WhatsAppMessage,
  contact: WhatsAppContact | null
): Promise<void> {
  const customerPhone = message.from;
  const customerName  = contact?.profile?.name ?? null;
  const messageType   = message.type;

  logger.info(
    { storeId: store.id, from: customerPhone, type: messageType, messageId: message.id },
    'Processing incoming message'
  );

  // Deduplicate — Meta sometimes delivers the same message twice
  const redis = getRedis();
  if (redis) {
    const dedupeKey = `msg_seen:${message.id}`;
    const alreadySeen = await redis.set(dedupeKey, '1', 'EX', 86400, 'NX');
    if (!alreadySeen) {
      logger.debug({ messageId: message.id }, 'Duplicate message — skipping');
      return;
    }
  }

  // For interactive messages:
  //   - routingContent = button/list ID  (used for backend routing)
  //   - displayContent = human-readable title (stored in conversation history)
  // For text messages both are the same.
  const { routingContent, displayContent } = extractContent(message);

  const wa = await WhatsAppService.forStore(store.id);

  if (!routingContent) {
    // Unsupported message type (voice, sticker, etc.)
    logger.debug({ type: messageType }, 'Unsupported message type — sending hint');
    if (wa) {
      await wa.sendText(
        customerPhone,
        'عذراً، لا أقدر أتعامل مع هذا النوع من الرسائل 🎤\nاكتب اسم المنتج أو "هلا" للبدء.'
      );
    }
    return;
  }

  if (wa) await wa.markAsRead(message.id);

  try {
    // ── Step 1: Load customer + session ───────────────────────────────────
    const customer = await CustomerService.findOrCreate(store.id, customerPhone, customerName);

    // Detect language from display text (not button IDs)
    // Require ≥70% confidence to switch language — avoids flipping on mixed text like "شكراً thanks"
    const detectedLang = detectLanguage(displayContent);
    if (detectedLang && detectedLang !== customer.language) {
      await CustomerService.updateLanguage(customer.id, detectedLang);
      customer.language = detectedLang;
    }
    const language = customer.language || 'ar';

    const session = await SessionService.get(store.id, customer.id);

    // Log conversation_started only when starting a fresh session (state === 'idle')
    // Avoids flooding analytics_events with one row per message
    if (session.state === 'idle') {
      AnalyticsService.log('conversation_started', store.id, customer.id, {
        phone: customerPhone,
        is_new: customer.total_orders === 0,
        total_orders: customer.total_orders,
      });
    }

    const catalog  = new CatalogFlow(store.id, language);
    const fallback = new FallbackRouter(store.id, language);

    // ── Step 2: Append user message to history ────────────────────────────
    const userMsg: ConversationMessage = {
      role: 'user',
      content: displayContent,
      timestamp: new Date().toISOString(),
    };
    await ConversationManager.appendMessage(store.id, customer.id, userMsg);

    // ── Step 3: CatalogFlow (backend decision maker) ──────────────────────
    // Passes the ID for interactive messages so routing works via button IDs.
    const catalogResult = await catalog.handle(
      routingContent,  // ID for buttons/lists, text for text messages
      messageType,
      store,
      customer,
      session
    );

    let aiResponse = catalogResult?.response ?? null;
    const newState  = catalogResult?.newState;

    if (aiResponse) {
      logger.info({ storeId: store.id, from: customerPhone, state: newState?.state }, 'CatalogFlow handled');
    } else {
      // ── Step 4: FallbackRouter (keyword patterns, no AI call) ─────────────
      // Use displayContent here (human text, not IDs)
      const fallbackResponse = await fallback.handle(displayContent, store, customer);

      if (fallbackResponse) {
        logger.info({ storeId: store.id, from: customerPhone }, 'FallbackRouter handled');
        aiResponse = fallbackResponse;
      } else {
        // ── Step 5: AI Engine (open-ended questions only) ──────────────────
        const history = await ConversationManager.loadHistory(store.id, customer.id);

        try {
          // Load current cart so AI has full context (e.g. knows what's in cart)
          let currentCart = null;
          try {
            currentCart = await CartService.getOrCreate(store.id, customer.id);
          } catch (cartErr) {
            logger.warn({ cartErr }, 'Failed to load cart for AI context — continuing without it');
          }

          aiResponse = await aiEngine.processMessage({
            store,
            customer,
            userMessage: displayContent,
            messageType,
            conversationHistory: history,
            currentCart,
          });
          logger.info({ storeId: store.id, from: customerPhone }, 'AI Engine handled');
        } catch (aiErr) {
          // ── Step 6: AI failed → keyword fallback (never show raw error) ─
          logger.error({ err: aiErr, storeId: store.id }, 'AI engine threw — using keyword fallback');
          aiResponse = await fallback.handleAIFailure(displayContent, store, customer);
        }
      }
    }

    // ── Step 7: Send response via WhatsApp (before state save) ───────────
    // Sending BEFORE saving state ensures we don't advance state when delivery fails.
    if (!wa) {
      logger.warn({ storeId: store.id, from: customerPhone }, 'No WhatsApp service available');
      return;
    }

    let delivered = await wa.sendResponse(customerPhone, aiResponse);

    // One retry on failure (exponential backoff would be overkill here)
    if (!delivered) {
      logger.warn({ storeId: store.id, from: customerPhone }, 'WhatsApp send failed — retrying once');
      await new Promise((r) => setTimeout(r, 1500));
      delivered = await wa.sendResponse(customerPhone, aiResponse);
    }

    if (!delivered) {
      logger.error({ storeId: store.id, from: customerPhone }, 'WhatsApp delivery failed after retry — state NOT updated');
      return; // Do NOT advance session state — customer never saw the response
    }

    logger.info(
      { storeId: store.id, from: customerPhone, len: aiResponse.text.length, ui: aiResponse.suggestedUI },
      'Message processed successfully'
    );

    // ── Step 8: Save updated session state (only after successful send) ──
    if (newState) {
      await SessionService.set(store.id, customer.id, newState);
    }

    // ── Step 9: Save assistant reply to conversation history ─────────────
    const assistantMsg: ConversationMessage = {
      role: 'assistant',
      content: aiResponse.text,
      timestamp: new Date().toISOString(),
    };
    await ConversationManager.appendMessage(store.id, customer.id, assistantMsg);
  } catch (err) {
    logger.error({ err, storeId: store.id, from: customerPhone }, 'Fatal error in processMessage');
    if (wa) {
      const fallbackLang = detectLanguage(displayContent) ?? 'ar';
      const hint =
        fallbackLang === 'ar'
          ? 'اكتب "هلا" للبدء أو اسم المنتج للبحث عنه 😊'
          : 'Type "hi" to start or a product name to search 😊';
      await wa.sendText(customerPhone, hint);
    }
  }
}

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

/**
 * Extract routing content (button/list ID) and display content (human title).
 *
 * For interactive messages:
 *   routingContent = button/list row ID  (e.g. "cat_abc123", "menu_browse")
 *   displayContent = human title         (e.g. "الخضار", "تصفح المنتجات")
 *
 * For text messages, both are the same raw text.
 */
function extractContent(message: WhatsAppMessage): {
  routingContent: string | null;
  displayContent: string;
} {
  switch (message.type) {
    case 'text': {
      const body = message.text?.body ?? null;
      return { routingContent: body, displayContent: body ?? '' };
    }

    case 'interactive': {
      if (message.interactive?.button_reply) {
        const { id, title } = message.interactive.button_reply;
        return { routingContent: id, displayContent: title };
      }
      if (message.interactive?.list_reply) {
        const { id, title } = message.interactive.list_reply;
        return { routingContent: id, displayContent: title };
      }
      return { routingContent: null, displayContent: '' };
    }

    case 'button':
      return {
        routingContent: message.button?.payload ?? message.button?.text ?? null,
        displayContent: message.button?.text ?? '',
      };

    case 'location': {
      const { latitude, longitude, name, address } = message.location ?? {};
      if (latitude === undefined) return { routingContent: null, displayContent: '' };
      const loc = `[LOCATION: lat=${latitude}, lng=${longitude}${name ? `, name=${name}` : ''}${address ? `, address=${address}` : ''}]`;
      return { routingContent: loc, displayContent: loc };
    }

    case 'image': {
      const caption = message.image?.caption;
      const content = caption ? `[IMAGE: ${caption}]` : '[IMAGE]';
      return { routingContent: content, displayContent: content };
    }

    case 'audio':
    case 'document':
    default:
      return { routingContent: null, displayContent: '' };
  }
}

/**
 * Detect whether the message is predominantly Arabic or English.
 *
 * Requires ≥70% of alphabetic characters to be one script before switching.
 * This avoids flipping language on mixed input like "شكراً thanks" or button IDs.
 * Returns null if content is too short or confidence is below threshold.
 */
function detectLanguage(text: string): string | null {
  if (!text || text.trim().length < 2) return null;
  const ar = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  const en = (text.match(/[a-zA-Z]/g) ?? []).length;
  const total = ar + en;
  if (total < 2) return null; // too few alphabetic chars
  const confidence = 0.70;
  if (ar / total >= confidence) return 'ar';
  if (en / total >= confidence) return 'en';
  return null; // ambiguous — keep existing language preference
}

export default router;
