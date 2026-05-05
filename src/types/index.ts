// ═══════════════════════════════════════════
// STORE TYPES
// ═══════════════════════════════════════════

export interface Store {
  id: string;
  name: string;
  name_ar: string;
  phone: string;
  whatsapp_phone_id: string | null;
  whatsapp_token: string | null;
  city: string | null;
  working_hours: Record<string, string>;
  delivery_zones: DeliveryZone[];
  delivery_fee: number;
  free_delivery_above: number;
  min_order: number;
  payment_methods: string[];
  vat_rate: number;
  subscription_plan: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface DeliveryZone {
  name: string;
  name_ar: string;
  fee: number;
  min_order: number;
  coordinates?: { lat: number; lng: number }[];
}

// ═══════════════════════════════════════════
// PRODUCT TYPES
// ═══════════════════════════════════════════

export interface Category {
  id: string;
  store_id: string;
  name_ar: string;
  name_en: string | null;
  sort_order: number;
  is_active: boolean;
  product_count?: number;
}

export interface Product {
  id: string;
  store_id: string;
  category_id: string | null;
  name_ar: string;
  name_en: string | null;
  description_ar: string | null;
  description_en: string | null;
  price: number;
  unit: string;
  sku: string | null;
  barcode: string | null;
  image_url: string | null;
  in_stock: boolean;
  stock_qty: number | null;
  alternatives: string[];
  tags: string[];
  is_active: boolean;
}

// ═══════════════════════════════════════════
// CUSTOMER TYPES
// ═══════════════════════════════════════════

export interface Customer {
  id: string;
  store_id: string;
  phone: string;
  name: string | null;
  language: string;
  addresses: CustomerAddress[];
  preferences: Record<string, unknown>;
  total_orders: number;
  total_spent: number;
  last_order_at: Date | null;
  marketing_consent: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CustomerAddress {
  label: string;
  address: string;
  zone: string;
  lat?: number;
  lng?: number;
  is_default: boolean;
}

// ═══════════════════════════════════════════
// CART TYPES
// ═══════════════════════════════════════════

export interface Cart {
  id: string;
  store_id: string;
  customer_id: string;
  items: CartItem[];
  subtotal: number;
  promo_code: string | null;
  discount: number;
  expires_at: Date;
}

export interface CartItem {
  product_id: string;
  name_ar: string;
  name_en: string | null;
  price: number;
  quantity: number;
  unit: string;
  subtotal: number;
  special_instructions?: string;  // e.g. "no onions", "extra spicy"
}

export type OrderType = 'delivery' | 'pickup';

// ═══════════════════════════════════════════
// ORDER TYPES
// ═══════════════════════════════════════════

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'refunded';

export interface Order {
  id: string;
  store_id: string;
  customer_id: string;
  order_number: number;
  items: CartItem[];
  subtotal: number;
  vat_amount: number;
  delivery_fee: number;
  discount: number;
  total: number;
  status: OrderStatus;
  payment_method: string | null;
  payment_status: PaymentStatus;
  payment_reference: string | null;
  delivery_address: CustomerAddress | null;
  delivery_slot: DeliverySlot | null;
  estimated_delivery: Date | null;
  delivered_at: Date | null;
  notes: string | null;
  cancelled_reason: string | null;
  zatca_invoice_ref: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface DeliverySlot {
  slot_id: string;
  date: string;
  time_range: string;
}

// ═══════════════════════════════════════════
// CONVERSATION TYPES
// ═══════════════════════════════════════════

export type ConversationState =
  | 'idle'
  | 'greeting'
  | 'browsing'
  | 'cart'
  | 'checkout'
  | 'payment'
  | 'tracking'
  | 'support';

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  function_calls?: FunctionCall[];
}

export interface FunctionCall {
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
}

export interface Conversation {
  id: string;
  store_id: string;
  customer_id: string;
  messages: ConversationMessage[];
  state: ConversationState;
  metadata: Record<string, unknown>;
  last_message_at: Date;
}

// ═══════════════════════════════════════════
// WHATSAPP TYPES
// ═══════════════════════════════════════════

export interface WhatsAppWebhookBody {
  object: string;
  entry: WhatsAppEntry[];
}

export interface WhatsAppEntry {
  id: string;
  changes: WhatsAppChange[];
}

export interface WhatsAppChange {
  value: WhatsAppChangeValue;
  field: string;
}

export interface WhatsAppChangeValue {
  messaging_product: string;
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
  statuses?: WhatsAppStatus[];
}

export interface WhatsAppContact {
  profile: { name: string };
  wa_id: string;
}

export interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: WhatsAppMessageType;
  text?: { body: string };
  image?: WhatsAppMedia;
  audio?: WhatsAppMedia;
  video?: WhatsAppMedia;
  document?: WhatsAppMedia;
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  button?: { text: string; payload: string };
}

export type WhatsAppMessageType =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'location'
  | 'interactive'
  | 'button'
  | 'sticker'
  | 'contacts'
  | 'order';

export interface WhatsAppMedia {
  id: string;
  mime_type: string;
  sha256?: string;
  caption?: string;
}

export interface WhatsAppStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  errors?: { code: number; title: string }[];
}

// ═══════════════════════════════════════════
// PROMOTION TYPES
// ═══════════════════════════════════════════

export type PromoType = 'percentage' | 'fixed' | 'buy_x_get_y' | 'free_delivery';

export interface Promotion {
  id: string;
  store_id: string;
  code: string | null;
  title_ar: string | null;
  title_en: string | null;
  type: PromoType;
  discount_value: number;
  min_order: number | null;
  product_ids: string[] | null;
  max_uses: number | null;
  used_count: number;
  valid_from: Date | null;
  valid_until: Date | null;
  is_active: boolean;
}

// ═══════════════════════════════════════════
// ANALYTICS TYPES
// ═══════════════════════════════════════════

export type AnalyticsEventType =
  | 'conversation_started'
  | 'product_searched'
  | 'product_added_to_cart'
  | 'cart_abandoned'
  | 'order_placed'
  | 'order_cancelled'
  | 'customer_complaint'
  | 'out_of_stock_hit'
  | 'promo_applied'
  | 'delivery_completed'
  | 'order_rated';

export interface AnalyticsEvent {
  id: string;
  store_id: string;
  customer_id: string | null;
  event_type: AnalyticsEventType;
  event_data: Record<string, unknown>;
  created_at: Date;
}

// ═══════════════════════════════════════════
// SUBSCRIPTION TYPES
// ═══════════════════════════════════════════

export type SubscriptionFrequency = 'weekly' | 'biweekly' | 'monthly';

export interface Subscription {
  id: string;
  store_id: string;
  customer_id: string;
  items: CartItem[];
  frequency: SubscriptionFrequency;
  delivery_day: string;
  next_delivery: Date;
  status: 'active' | 'paused' | 'cancelled';
}

// ═══════════════════════════════════════════
// AI ENGINE TYPES
// ═══════════════════════════════════════════

export interface AIContext {
  store: Store;
  customer: Customer;
  userMessage: string;
  messageType: string;
  conversationHistory: ConversationMessage[];
  currentCart: Cart | null;
}

export interface AIResponse {
  text: string;
  language: string;
  /**
   * 'image' → send a standalone WhatsApp image message.
   *   text   = caption shown under the image
   *   imageUrl = the photo URL (must be a direct, non-redirecting HTTPS link)
   *   followUp = optional button/text message sent 300 ms after the image
   *
   * Using 'image' + followUp instead of embedding imageUrl in ButtonData avoids
   * the "status: failed" delivery error caused by WhatsApp CDN rejecting
   * certain external image hosts (e.g. Unsplash) when used as interactive headers.
   */
  suggestedUI: 'buttons' | 'list' | 'text' | 'image' | null;
  imageUrl?: string;    // only used when suggestedUI === 'image'
  buttons?: ButtonData;
  listData?: ListData;
  /**
   * Optional second message sent immediately after this one.
   * Used for the main menu two-card layout and image+buttons pattern.
   */
  followUp?: AIResponse;
}

export interface ButtonData {
  body: string;
  buttons: { id: string; title: string }[];
  header?: string;      // text header (ignored when imageUrl is set)
  imageUrl?: string;    // image header — shown above body in interactive message
  footer?: string;
}

export interface ListData {
  body: string;
  buttonText: string;
  sections: {
    title: string;
    rows: { id: string; title: string; description?: string }[];
  }[];
  header?: string;
  footer?: string;
}

export interface ToolContext {
  storeId: string;
  customerId: string;
  language: string;
  customerPhone: string;
}

// ═══════════════════════════════════════════
// API / CONFIG TYPES
// ═══════════════════════════════════════════

export interface AppConfig {
  port: number;
  nodeEnv: string;
  databaseUrl: string;
  redisUrl: string;
  meta: {
    verifyToken: string;
    appSecret: string;
  };
  ai: {
    apiKey: string;
    model: string;
    maxTokens: number;
    temperature: number;
  };
  payment: {
    moyasarApiKey: string;
    moyasarPublishableKey: string;
  };
  jwt: {
    secret: string;
  };
  encryption: {
    key: string;
  };
}
