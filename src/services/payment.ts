/**
 * PaymentService — Moyasar payment link creation and status checking.
 *
 * Moyasar API docs: https://moyasar.com/docs/
 *
 * In development (when MOYASAR_API_KEY is empty), createPaymentLink()
 * returns a mock link so the rest of the flow can be tested.
 */

import axios from 'axios';
import { logger } from '../utils/logger';
import { queryOne } from '../database/connection';

const MOYASAR_BASE = 'https://api.moyasar.com/v1';

export interface PaymentLinkResult {
  paymentUrl: string;
  paymentId: string;
  expiresAt: Date;
}

export interface MoyasarPayment {
  id: string;
  status: 'initiated' | 'paid' | 'failed' | 'authorized' | 'captured' | 'refunded' | 'voided';
  amount: number;       // in halalas (SAR × 100)
  currency: string;
  description: string;
  metadata: Record<string, string>;
  source: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export const PaymentService = {
  /**
   * Create a Moyasar payment link for an order.
   * Returns a mock link in development when API key is missing.
   */
  async createPaymentLink(
    orderId: string,
    orderNumber: number,
    amountSar: number,
    customerPhone: string,
    description: string,
    callbackUrl: string
  ): Promise<PaymentLinkResult | null> {
    const apiKey = process.env.MOYASAR_API_KEY || '';

    // ── Dev fallback: no API key ─────────────────────────────────────────
    if (!apiKey) {
      logger.warn('MOYASAR_API_KEY not set — returning mock payment link');
      const mockId = `mock_${orderId.substring(0, 8)}`;
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      return {
        paymentUrl: `https://payment.example.com/pay/${mockId}`,
        paymentId: mockId,
        expiresAt,
      };
    }

    // ── Real Moyasar call ─────────────────────────────────────────────────
    try {
      const amountHalalas = Math.round(amountSar * 100); // SAR → Halalas

      const response = await axios.post(
        `${MOYASAR_BASE}/invoices`,
        {
          amount: amountHalalas,
          currency: 'SAR',
          description: description || `Order #${orderNumber}`,
          callback_url: callbackUrl,
          metadata: {
            order_id: orderId,
            order_number: String(orderNumber),
            customer_phone: customerPhone,
          },
          expired_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        },
        {
          auth: { username: apiKey, password: '' },
          timeout: 10_000,
        }
      );

      const data = response.data as {
        id: string;
        url: string;
        expired_at: string;
      };

      logger.info({ orderId, orderNumber, paymentId: data.id }, 'Moyasar payment link created');

      return {
        paymentUrl: data.url,
        paymentId: data.id,
        expiresAt: new Date(data.expired_at),
      };
    } catch (err) {
      logger.error({ err, orderId }, 'Moyasar createPaymentLink failed');
      return null;
    }
  },

  /**
   * Check the current status of a Moyasar payment by ID.
   */
  async getPaymentStatus(
    paymentId: string
  ): Promise<'paid' | 'pending' | 'failed' | 'expired' | null> {
    if (paymentId.startsWith('mock_')) return 'pending'; // dev mock

    const apiKey = process.env.MOYASAR_API_KEY || '';
    if (!apiKey) return null;

    try {
      const response = await axios.get(`${MOYASAR_BASE}/payments/${paymentId}`, {
        auth: { username: apiKey, password: '' },
        timeout: 8_000,
      });

      const payment = response.data as MoyasarPayment;

      if (payment.status === 'paid' || payment.status === 'captured') return 'paid';
      if (payment.status === 'failed' || payment.status === 'voided') return 'failed';
      if (payment.status === 'initiated' || payment.status === 'authorized') return 'pending';
      return 'pending';
    } catch (err) {
      logger.error({ err, paymentId }, 'Moyasar getPaymentStatus failed');
      return null;
    }
  },

  /**
   * Handle a Moyasar payment callback (webhook POST /payment/callback).
   * Updates order payment_status and payment_reference.
   * Returns the order ID if found, null otherwise.
   */
  async handleCallback(
    payload: Record<string, unknown>
  ): Promise<{ orderId: string | null; paid: boolean }> {
    try {
      // Moyasar sends { id, status, metadata: { order_id } }
      const paymentId = String(payload.id || '');
      const status    = String(payload.status || '');
      const metadata  = (payload.metadata as Record<string, string>) || {};
      const orderId   = metadata.order_id || '';

      if (!orderId) {
        logger.warn({ payload }, 'Moyasar callback missing order_id in metadata');
        return { orderId: null, paid: false };
      }

      const paid = status === 'paid' || status === 'captured';
      const paymentStatus = paid ? 'paid' : status === 'failed' ? 'failed' : 'pending';

      await queryOne(
        `UPDATE orders
         SET payment_status    = $1,
             payment_reference = $2,
             updated_at        = NOW()
         WHERE id = $3`,
        [paymentStatus, paymentId, orderId]
      );

      logger.info({ orderId, paymentId, paymentStatus }, 'Moyasar callback processed');
      return { orderId, paid };
    } catch (err) {
      logger.error({ err, payload }, 'PaymentService.handleCallback failed');
      return { orderId: null, paid: false };
    }
  },

  /**
   * Issue a refund for a payment (Moyasar refund API).
   * Returns true on success.
   */
  async processRefund(paymentId: string, amountSar: number, reason?: string): Promise<boolean> {
    if (paymentId.startsWith('mock_')) {
      logger.info({ paymentId }, 'Mock refund processed');
      return true;
    }

    const apiKey = process.env.MOYASAR_API_KEY || '';
    if (!apiKey) {
      logger.warn('MOYASAR_API_KEY not set — cannot process refund');
      return false;
    }

    try {
      await axios.post(
        `${MOYASAR_BASE}/payments/${paymentId}/refund`,
        {
          amount: Math.round(amountSar * 100),
          ...(reason && { reason }),
        },
        {
          auth: { username: apiKey, password: '' },
          timeout: 10_000,
        }
      );

      logger.info({ paymentId, amountSar }, 'Refund processed');
      return true;
    } catch (err) {
      logger.error({ err, paymentId }, 'PaymentService.processRefund failed');
      return false;
    }
  },
};
