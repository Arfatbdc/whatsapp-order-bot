/**
 * Payment webhook route — POST /payment/callback
 *
 * Moyasar calls this URL when a payment is completed, failed, or expired.
 * We update the order's payment_status accordingly and (if paid) fire
 * an analytics event.
 *
 * Security: Moyasar signs requests with HMAC-SHA256 using your secret key.
 * In production, verify the signature before trusting the payload.
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { PaymentService } from '../services/payment';
import { AnalyticsService } from '../services/analytics';
import { queryOne } from '../database/connection';
import { Order } from '../types';
import { logger } from '../utils/logger';

const router = Router();

// ═══════════════════════════════════════════
// POST /payment/callback  (Moyasar webhook)
// ═══════════════════════════════════════════
router.post('/callback', async (req: Request, res: Response): Promise<void> => {
  // Respond 200 immediately — Moyasar retries on non-200
  res.status(200).json({ received: true });

  const payload = req.body as Record<string, unknown>;

  // ── Optional: verify Moyasar HMAC signature ──────────────────────────────
  const secret = process.env.MOYASAR_WEBHOOK_SECRET;
  if (secret) {
    const signature = req.headers['x-moyasar-signature'] as string | undefined;
    if (signature) {
      const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
      if (rawBody) {
        const expected = crypto
          .createHmac('sha256', secret)
          .update(rawBody)
          .digest('hex');
        if (`sha256=${expected}` !== signature) {
          logger.warn({ signature }, 'Invalid Moyasar webhook signature — ignoring');
          return;
        }
      }
    }
  }

  try {
    const { orderId, paid } = await PaymentService.handleCallback(payload);

    if (!orderId) {
      logger.warn({ payload }, 'Moyasar callback: no order ID found');
      return;
    }

    if (paid) {
      // Fetch order to log analytics with storeId
      const order = await queryOne<Order>('SELECT * FROM orders WHERE id = $1', [orderId]);
      if (order) {
        AnalyticsService.log('order_placed', order.store_id, order.customer_id, {
          order_id: orderId,
          order_number: order.order_number,
          total: order.total,
          payment_method: 'online',
          payment_reference: String(payload.id ?? ''),
        });
        logger.info({ orderId, orderNumber: order.order_number }, 'Payment confirmed — order marked paid');
      }
    }
  } catch (err) {
    logger.error({ err, payload }, 'Payment callback processing error');
  }
});

// ═══════════════════════════════════════════
// GET /payment/status/:paymentId  (optional polling)
// ═══════════════════════════════════════════
router.get('/status/:paymentId', async (req: Request, res: Response): Promise<void> => {
  const { paymentId } = req.params;

  const status = await PaymentService.getPaymentStatus(paymentId);
  if (!status) {
    res.status(404).json({ error: 'Payment not found' });
    return;
  }

  res.json({ payment_id: paymentId, status });
});

export default router;
