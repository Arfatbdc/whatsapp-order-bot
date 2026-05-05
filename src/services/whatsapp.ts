import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';
import { queryOne } from '../database/connection';
import { Store, AIResponse } from '../types';

const WHATSAPP_API_BASE = 'https://graph.facebook.com/v19.0';

/**
 * WhatsApp Cloud API service.
 * Handles sending messages, marking as read, and managing media.
 */
export class WhatsAppService {
  private client: AxiosInstance;

  constructor(phoneNumberId: string, accessToken: string) {
    this.client = axios.create({
      baseURL: `${WHATSAPP_API_BASE}/${phoneNumberId}`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
  }

  /**
   * Create a WhatsApp service instance for a given store.
   */
  static async forStore(storeId: string): Promise<WhatsAppService | null> {
    // In development, prefer fresh env credentials to avoid stale DB tokens.
    if (process.env.NODE_ENV !== 'production') {
      const envPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
      const envToken = process.env.WHATSAPP_ACCESS_TOKEN;
      if (envPhoneId && envToken) {
        return new WhatsAppService(envPhoneId, envToken);
      }
    }

    // Dev store: use env vars directly, no DB needed
    if (storeId === 'dev-store-001') {
      const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
      const token = process.env.WHATSAPP_ACCESS_TOKEN;
      if (phoneId && token) return new WhatsAppService(phoneId, token);
      logger.error('Dev store: WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN missing in .env');
      return null;
    }

    try {
      const store = await queryOne<Store>(
        'SELECT whatsapp_phone_id, whatsapp_token FROM stores WHERE id = $1 AND is_active = true',
        [storeId]
      );

      if (!store?.whatsapp_phone_id || !store?.whatsapp_token) {
        logger.error({ storeId }, 'Store WhatsApp credentials not configured');
        return null;
      }

      return new WhatsAppService(store.whatsapp_phone_id, store.whatsapp_token);
    } catch (err) {
      logger.warn({ err, storeId }, 'DB unavailable for WhatsApp service - trying env vars');
      const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
      const token = process.env.WHATSAPP_ACCESS_TOKEN;
      if (phoneId && token) return new WhatsAppService(phoneId, token);
      return null;
    }
  }

  /**
   * Send a text message.
   */
  async sendText(to: string, body: string): Promise<string | null> {
    try {
      const response = await this.client.post('/messages', {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body },
      });

      const messageId = response.data?.messages?.[0]?.id;
      logger.info({ to, messageId }, 'Text message sent');
      return messageId;
    } catch (err) {
      this.logMetaError(err, 'Failed to send text message', { to });
      return null;
    }
  }

  /**
   * Send an interactive button message (up to 3 buttons).
   *
   * Header priority: imageUrl > header text > none
   * When imageUrl is provided the image appears above the body text — this is
   * the native WhatsApp "image header" for interactive messages (one API call).
   */
  async sendButtons(
    to: string,
    body: string,
    buttons: { id: string; title: string }[],
    header?: string,
    footer?: string,
    imageUrl?: string
  ): Promise<string | null> {
    // Build the header object: image takes precedence over text
    let headerObj: Record<string, unknown> | undefined;
    if (imageUrl) {
      headerObj = { type: 'image', image: { link: imageUrl } };
    } else if (header) {
      headerObj = { type: 'text', text: header };
    }

    try {
      const response = await this.client.post('/messages', {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'button',
          ...(headerObj && { header: headerObj }),
          body: { text: body },
          ...(footer && { footer: { text: footer } }),
          action: {
            buttons: buttons.map((btn) => ({
              type: 'reply',
              reply: { id: btn.id, title: btn.title },
            })),
          },
        },
      });

      const messageId = response.data?.messages?.[0]?.id;
      logger.info({ to, messageId, hasImage: Boolean(imageUrl) }, 'Button message sent');
      return messageId;
    } catch (err) {
      this.logMetaError(err, 'Failed to send button message', { to });
      return null;
    }
  }

  /**
   * Send an interactive list message (up to 10 items per section).
   */
  async sendList(
    to: string,
    body: string,
    buttonText: string,
    sections: {
      title: string;
      rows: { id: string; title: string; description?: string }[];
    }[],
    header?: string,
    footer?: string
  ): Promise<string | null> {
    try {
      const response = await this.client.post('/messages', {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'list',
          ...(header && { header: { type: 'text', text: header } }),
          body: { text: body },
          ...(footer && { footer: { text: footer } }),
          action: {
            button: buttonText,
            sections,
          },
        },
      });

      const messageId = response.data?.messages?.[0]?.id;
      logger.info({ to, messageId }, 'List message sent');
      return messageId;
    } catch (err) {
      this.logMetaError(err, 'Failed to send list message', { to });
      return null;
    }
  }

  /**
   * Send an image message.
   */
  async sendImage(to: string, imageUrl: string, caption?: string): Promise<string | null> {
    try {
      const response = await this.client.post('/messages', {
        messaging_product: 'whatsapp',
        to,
        type: 'image',
        image: {
          link: imageUrl,
          ...(caption && { caption }),
        },
      });

      const messageId = response.data?.messages?.[0]?.id;
      logger.info({ to, messageId }, 'Image message sent');
      return messageId;
    } catch (err) {
      this.logMetaError(err, 'Failed to send image message', { to });
      return null;
    }
  }

  /**
   * Mark a message as read (blue ticks).
   */
  async markAsRead(messageId: string): Promise<void> {
    try {
      await this.client.post('/messages', {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      });
    } catch (err) {
      this.logMetaError(err, 'Failed to mark message as read', { messageId });
    }
  }

  /**
   * Send a location message.
   */
  async sendLocation(
    to: string,
    latitude: number,
    longitude: number,
    name?: string,
    address?: string
  ): Promise<string | null> {
    try {
      const response = await this.client.post('/messages', {
        messaging_product: 'whatsapp',
        to,
        type: 'location',
        location: {
          latitude,
          longitude,
          ...(name && { name }),
          ...(address && { address }),
        },
      });

      const messageId = response.data?.messages?.[0]?.id;
      return messageId;
    } catch (err) {
      this.logMetaError(err, 'Failed to send location message', { to });
      return null;
    }
  }

  /**
   * Send a response based on the AIResponse object.
   * If response.followUp is set, sends that as a second message immediately
   * after the first (used for the two-card main menu layout and image+buttons pattern).
   *
   * Returns true if EITHER the main message OR the followUp was delivered.
   * This correctly handles the image+buttons pattern where the image may fail
   * (CDN issue) but the buttons message still reaches the user.
   */
  async sendResponse(to: string, response: AIResponse): Promise<boolean> {
    const mainOk = await this.sendSingleResponse(to, response);
    let followUpOk = false;
    if (response.followUp) {
      // Small delay so messages appear in order (WhatsApp doesn't guarantee ordering)
      await new Promise((r) => setTimeout(r, 300));
      followUpOk = await this.sendSingleResponse(to, response.followUp);
    }
    return mainOk || followUpOk;
  }

  /** Internal: send exactly one message (no followUp handling). */
  private async sendSingleResponse(to: string, response: AIResponse): Promise<boolean> {
    switch (response.suggestedUI) {

      // ── Standalone image (+ optional caption) ────────────────────────────
      // Used instead of interactive-button image headers to avoid WhatsApp CDN
      // delivery failures with certain external image hosts.
      case 'image': {
        if (response.imageUrl) {
          const msgId = await this.sendImage(to, response.imageUrl, response.text || undefined);
          if (msgId) return true;
          // Image URL rejected by Meta or CDN — send caption as plain text fallback
          logger.warn({ to, imageUrl: response.imageUrl }, 'Image send failed — sending text fallback');
        }
        return Boolean(await this.sendText(to, response.text));
      }

      case 'buttons':
        if (response.buttons) {
          // Never pass imageUrl here — use suggestedUI:'image' + followUp instead.
          // Keeping imageUrl support in ButtonData for backwards compat but not recommended.
          const messageId = await this.sendButtons(
            to,
            response.buttons.body,
            response.buttons.buttons,
            response.buttons.header,
            response.buttons.footer,
            response.buttons.imageUrl
          );
          return Boolean(messageId);
        }
        return Boolean(await this.sendText(to, response.text));

      case 'list':
        if (response.listData) {
          const messageId = await this.sendList(
            to,
            response.listData.body,
            response.listData.buttonText,
            response.listData.sections,
            response.listData.header,
            response.listData.footer
          );
          return Boolean(messageId);
        }
        return Boolean(await this.sendText(to, response.text));

      case 'text':
      default:
        return Boolean(await this.sendText(to, response.text));
    }
  }

  /**
   * Send a reaction emoji.
   */
  async sendReaction(to: string, messageId: string, emoji: string): Promise<void> {
    try {
      await this.client.post('/messages', {
        messaging_product: 'whatsapp',
        to,
        type: 'reaction',
        reaction: {
          message_id: messageId,
          emoji,
        },
      });
    } catch (err) {
      this.logMetaError(err, 'Failed to send reaction', { to });
    }
  }

  private logMetaError(err: unknown, message: string, context: Record<string, unknown>): void {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const data = err.response?.data as {
        error?: { code?: number; error_subcode?: number; message?: string; type?: string };
      } | undefined;
      const metaError = data?.error;
      const expired =
        metaError?.code === 190 &&
        (metaError?.error_subcode === 463 ||
          metaError?.message?.toLowerCase().includes('session has expired'));

      logger.error(
        {
          ...context,
          status,
          metaCode: metaError?.code,
          metaSubcode: metaError?.error_subcode,
          metaType: metaError?.type,
          metaMessage: metaError?.message,
        },
        message
      );

      if (expired) {
        logger.error(
          'WhatsApp access token is expired. Generate a new permanent token in Meta and update store.whatsapp_token or WHATSAPP_ACCESS_TOKEN.'
        );
      }
      return;
    }

    logger.error({ ...context, err }, message);
  }
}

/**
 * Look up which store a WhatsApp phone_number_id belongs to.
 * Falls back to env vars in development when DB is unavailable or empty.
 */
export async function findStoreByPhoneId(phoneNumberId: string): Promise<Store | null> {
  try {
    const store = await queryOne<Store>(
      'SELECT * FROM stores WHERE whatsapp_phone_id = $1 AND is_active = true',
      [phoneNumberId]
    );
    if (store) return store;
  } catch (err) {
    logger.warn({ err }, 'DB unavailable for store lookup - trying env var fallback');
  }

  // Dev fallback: build a store from env vars (works without a database)
  if (
    process.env.NODE_ENV !== 'production' &&
    phoneNumberId === process.env.WHATSAPP_PHONE_NUMBER_ID
  ) {
    logger.info({ phoneNumberId }, 'Using dev-mode store from env vars');
    return buildDevStore();
  }

  return null;
}

/**
 * Build a minimal Store object from environment variables.
 * Used in development when no database record exists yet.
 */
function buildDevStore(): Store {
  return {
    id: 'b4b66636-fc8b-4af9-b70d-1509fbc9f983',
    name: process.env.STORE_NAME || 'Alarfa Restaurant',
    name_ar: process.env.STORE_NAME_AR || 'مطعم العرفاء ',
    phone: process.env.STORE_PHONE || '+9660556065392',
    whatsapp_phone_id: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    whatsapp_token: process.env.WHATSAPP_ACCESS_TOKEN || '',
    city: 'Abha',
    working_hours: { 'sat-sat': '11:00-24:00' },
    delivery_zones: [
      { name: 'North Abha', name_ar: 'شمال أبها', fee: 10, min_order: 30 },
      { name: 'South Abha', name_ar: 'جنوب أبها', fee: 12, min_order: 30 },
      { name: 'East Abha',  name_ar: 'شرق أبها',  fee: 10, min_order: 30 },
      { name: 'West Abha',  name_ar: 'غرب أبها',  fee: 15, min_order: 50 },
    ],
    delivery_fee: 10,
    free_delivery_above: 100,
    min_order: 30,
    payment_methods: ['cash', 'sabaka', 'transfer'],
    vat_rate: 0.15,
    subscription_plan: 'basic',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };
}
