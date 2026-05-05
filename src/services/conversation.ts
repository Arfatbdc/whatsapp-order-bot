import { ConversationMessage } from '../types';
import { getConversationContext, addConversationMessage, clearConversationContext } from '../database/redis';
import { query, queryOne } from '../database/connection';
import { logger } from '../utils/logger';

const MAX_HISTORY = 20;

/**
 * Conversation state manager.
 * Redis is the primary store (fast reads/writes).
 * PostgreSQL is the persistence layer (async upsert).
 */
export class ConversationManager {
  /**
   * Load conversation history. Tries Redis first, falls back to DB.
   * Returns messages in chronological order (oldest first).
   */
  static async loadHistory(
    storeId: string,
    customerId: string
  ): Promise<ConversationMessage[]> {
    try {
      // Redis stores newest-first (lpush), so we reverse for chronological order
      const raw = await getConversationContext(storeId, customerId);

      if (raw.length > 0) {
        try {
          return raw.map((r) => JSON.parse(r) as ConversationMessage).reverse();
        } catch {
          logger.warn({ storeId, customerId }, 'Failed to parse Redis conversation — falling back to DB');
        }
      }

      // Fall back to DB
      return await this.loadFromDb(storeId, customerId);
    } catch (err) {
      logger.warn({ err, storeId, customerId }, 'Redis/DB unavailable for history — starting fresh');
      return [];
    }
  }

  /**
   * Append a single message to the conversation.
   * Writes to Redis immediately, then async-persists to DB.
   */
  static async appendMessage(
    storeId: string,
    customerId: string,
    message: ConversationMessage
  ): Promise<void> {
    try {
      await addConversationMessage(storeId, customerId, JSON.stringify(message));
      // Async DB persist — don't await to keep the response fast
      this.persistToDb(storeId, customerId).catch((err) => {
        logger.error({ err, storeId, customerId }, 'Failed to persist conversation to DB');
      });
    } catch (err) {
      logger.warn({ err }, 'Redis unavailable — message not persisted, continuing');
    }
  }

  /**
   * Persist current Redis conversation state to PostgreSQL.
   * Upserts the conversations table row.
   */
  static async persistToDb(storeId: string, customerId: string): Promise<void> {
    const raw = await getConversationContext(storeId, customerId);
    if (raw.length === 0) return;

    try {
      const messages = raw
        .map((r) => JSON.parse(r) as ConversationMessage)
        .reverse(); // chronological

      await query(
        `INSERT INTO conversations (store_id, customer_id, messages, last_message_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (store_id, customer_id)
         DO UPDATE SET
           messages = $3,
           last_message_at = NOW()`,
        [storeId, customerId, JSON.stringify(messages)]
      );
    } catch (err) {
      logger.error({ err }, 'Failed to upsert conversation in DB');
    }
  }

  static async clearHistory(storeId: string, customerId: string): Promise<void> {
    await clearConversationContext(storeId, customerId);
    await query(
      'UPDATE conversations SET messages = $1, last_message_at = NOW() WHERE store_id = $2 AND customer_id = $3',
      [JSON.stringify([]), storeId, customerId]
    );
  }

  private static async loadFromDb(
    storeId: string,
    customerId: string
  ): Promise<ConversationMessage[]> {
    try {
      const conv = await queryOne<{ messages: ConversationMessage[] }>(
        'SELECT messages FROM conversations WHERE store_id = $1 AND customer_id = $2',
        [storeId, customerId]
      );

      if (!conv?.messages) return [];

      const messages = Array.isArray(conv.messages) ? conv.messages : [];
      return messages.slice(-MAX_HISTORY);
    } catch {
      return [];
    }
  }
}
