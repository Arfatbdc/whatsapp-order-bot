/**
 * NotificationService — WhatsApp notifications for order events.
 * All methods are fire-and-forget (never await in the main flow).
 */
import { WhatsAppService } from './whatsapp';
import { Order, Customer } from '../types';
import { logger } from '../utils/logger';

const RATING_DELAY_MS = 2 * 60 * 1000; // 2 minutes

const STATUS_MSG: Record<string, { ar: string; en: string }> = {
  confirmed:        { ar: '✅ تم تأكيد طلبك!', en: '✅ Your order is confirmed!' },
  preparing:        { ar: '👨‍🍳 طلبك قيد التحضير...', en: '👨‍🍳 Your order is being prepared...' },
  out_for_delivery: { ar: '🚗 طلبك في الطريق إليك!', en: '🚗 Your order is on its way!' },
  delivered:        { ar: '✅ تم التوصيل! شكراً لك 🙏', en: '✅ Delivered! Thank you 🙏' },
  cancelled:        { ar: '❌ تم إلغاء طلبك.', en: '❌ Your order has been cancelled.' },
};

export const NotificationService = {
  /** Send order status update via WhatsApp (fire-and-forget). */
  notifyOrderStatus(order: Order, customer: Customer, lang = 'ar'): void {
    const msg = STATUS_MSG[order.status];
    if (!msg) return;

    const text = lang === 'ar'
      ? `${msg.ar}\nرقم الطلب: #${order.order_number}`
      : `${msg.en}\nOrder #${order.order_number}`;

    WhatsAppService.forStore(order.store_id)
      .then((wa) => wa?.sendText(customer.phone, text))
      .catch((err) => logger.warn({ err, orderId: order.id }, 'NotificationService: WhatsApp send failed'));

    // When order is delivered, schedule a rating request after 2 minutes (fire-and-forget)
    if (order.status === 'delivered') {
      setTimeout(() => {
        this.sendRatingRequest(order.store_id, customer.phone, order.id, order.order_number, lang)
          .catch((err) => logger.warn({ err, orderId: order.id }, 'NotificationService: rating request failed'));
      }, RATING_DELAY_MS);
    }
  },

  /** Send a post-delivery rating request with interactive buttons. */
  async sendRatingRequest(
    storeId: string,
    customerPhone: string,
    orderId: string,
    orderNumber: number,
    lang = 'ar'
  ): Promise<void> {
    try {
      const wa = await WhatsAppService.forStore(storeId);
      if (!wa) return;

      const text = lang === 'ar'
        ? `كيف كانت تجربتك معنا؟ 😊\nطلبك رقم #${orderNumber} تم توصيله.`
        : `How was your experience? 😊\nYour order #${orderNumber} has been delivered.`;

      await wa.sendText(customerPhone, text);

      // Send rating buttons as a follow-up interactive message
      const ratingBody = lang === 'ar' ? 'قيّم تجربتك:' : 'Rate your experience:';
      const ratingButtons: { id: string; title: string }[] = [
        { id: `rate_5_${orderId}`, title: '⭐⭐⭐⭐⭐ ممتاز' },
        { id: `rate_3_${orderId}`, title: '⭐⭐⭐ جيد' },
        { id: `rate_1_${orderId}`, title: lang === 'ar' ? 'يحتاج تحسين' : 'Needs Improvement' },
      ];
      await wa.sendButtons(customerPhone, ratingBody, ratingButtons);
    } catch (err) {
      logger.warn({ err, orderId, customerPhone }, 'NotificationService.sendRatingRequest failed');
    }
  },

  /** Notify customer that payment was received. */
  notifyPaymentReceived(order: Order, customer: Customer, lang = 'ar'): void {
    const text = lang === 'ar'
      ? `✅ تم استلام دفعتك بنجاح!\nرقم الطلب: #${order.order_number}\nالإجمالي: ${order.total.toFixed(2)} ر.س`
      : `✅ Payment received!\nOrder #${order.order_number}\nTotal: ${order.total.toFixed(2)} SAR`;

    WhatsAppService.forStore(order.store_id)
      .then((wa) => wa?.sendText(customer.phone, text))
      .catch((err) => logger.warn({ err, orderId: order.id }, 'Notification: payment received send failed'));
  },

  /** Cart abandonment reminder — sent 2 hours after last activity if cart not empty. */
  async sendCartAbandonmentReminders(storeId: string): Promise<void> {
    // This is called by the scheduler — find carts updated > 2h ago with items
    try {
      const { query } = await import('../database/connection');
      const abandoned = await query<{
        customer_id: string; phone: string; language: string; subtotal: number;
      }>(
        `SELECT ca.customer_id, cu.phone, cu.language, ca.subtotal
         FROM carts ca JOIN customers cu ON ca.customer_id = cu.id
         WHERE ca.store_id = $1
           AND ca.updated_at < NOW() - INTERVAL '2 hours'
           AND ca.updated_at > NOW() - INTERVAL '3 hours'
           AND ca.subtotal > 0
           AND jsonb_array_length(ca.items) > 0`,
        [storeId]
      );

      for (const cart of abandoned) {
        const text = cart.language === 'ar'
          ? `🍽️ نسيت طلبك!\nعندك طلب بقيمة ${cart.subtotal.toFixed(2)} ر.س في السلة.\nاكتب "سلتي" لإكمال الطلب 😊`
          : `🍽️ You left items in your order!\nTotal: ${cart.subtotal.toFixed(2)} SAR\nType "cart" to complete your order 😊`;

        const wa = await WhatsAppService.forStore(storeId);
        await wa?.sendText(cart.phone, text);
      }
    } catch (err) {
      logger.warn({ err, storeId }, 'Cart abandonment reminder failed');
    }
  },
};
