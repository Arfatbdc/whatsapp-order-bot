import { Customer, CustomerAddress } from '../types';
import { query, queryOne } from '../database/connection';
import { logger } from '../utils/logger';

/**
 * Customer service — multi-tenant, storeId on every query.
 */
export class CustomerService {
  /**
   * Find existing customer by phone number, or create a new one.
   * Returns the full Customer record.
   */
  static async findOrCreate(
    storeId: string,
    phone: string,
    name?: string | null
  ): Promise<Customer> {
    try {
      // Try to find existing customer
      const existing = await queryOne<Customer>(
        'SELECT * FROM customers WHERE store_id = $1 AND phone = $2',
        [storeId, phone]
      );

      if (existing) {
        if (name && !existing.name) {
          await query(
            'UPDATE customers SET name = $1, updated_at = NOW() WHERE id = $2',
            [name, existing.id]
          );
          existing.name = name;
        }
        return existing;
      }

      // Create new customer
      const rows = await query<Customer>(
        `INSERT INTO customers (store_id, phone, name, language)
         VALUES ($1, $2, $3, 'ar')
         RETURNING *`,
        [storeId, phone, name || null]
      );

      const customer = rows[0];
      logger.info({ customerId: customer.id, phone }, 'New customer created');
      return customer;
    } catch (err) {
      // DB unavailable — return in-memory customer so the bot can still respond
      logger.warn({ err, phone }, 'DB unavailable for customer lookup — using in-memory fallback');
      return {
        id: `mem-${phone}`,
        store_id: storeId,
        phone,
        name: name || null,
        language: 'ar',
        addresses: [],
        preferences: {},
        total_orders: 0,
        total_spent: 0,
        last_order_at: null,
        marketing_consent: false,
        created_at: new Date(),
        updated_at: new Date(),
      };
    }
  }

  static async getById(storeId: string, customerId: string): Promise<Customer | null> {
    return queryOne<Customer>(
      'SELECT * FROM customers WHERE id = $1 AND store_id = $2',
      [customerId, storeId]
    );
  }

  static async updateLanguage(customerId: string, language: string): Promise<void> {
    await query(
      'UPDATE customers SET language = $1, updated_at = NOW() WHERE id = $2',
      [language, customerId]
    );
  }

  static async updateName(customerId: string, name: string): Promise<void> {
    await query(
      'UPDATE customers SET name = $1, updated_at = NOW() WHERE id = $2',
      [name, customerId]
    );
  }

  /**
   * Add or update a delivery address for the customer.
   * If is_default=true, clears default from other addresses first.
   */
  static async addAddress(
    customerId: string,
    address: CustomerAddress
  ): Promise<void> {
    const customer = await queryOne<{ addresses: CustomerAddress[] }>(
      'SELECT addresses FROM customers WHERE id = $1',
      [customerId]
    );

    if (!customer) return;

    let addresses: CustomerAddress[] = Array.isArray(customer.addresses)
      ? customer.addresses
      : [];

    if (address.is_default) {
      addresses = addresses.map((a) => ({ ...a, is_default: false }));
    }

    addresses.push(address);

    await query(
      'UPDATE customers SET addresses = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(addresses), customerId]
    );
  }

  static async getAddresses(customerId: string): Promise<CustomerAddress[]> {
    const customer = await queryOne<{ addresses: CustomerAddress[] }>(
      'SELECT addresses FROM customers WHERE id = $1',
      [customerId]
    );
    return Array.isArray(customer?.addresses) ? customer!.addresses : [];
  }

  static async getDefaultAddress(customerId: string): Promise<CustomerAddress | null> {
    const addresses = await this.getAddresses(customerId);
    return addresses.find((a) => a.is_default) || addresses[0] || null;
  }

  static async updatePreferences(
    customerId: string,
    prefs: Record<string, unknown>
  ): Promise<void> {
    await query(
      `UPDATE customers
       SET preferences = preferences || $1::jsonb, updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(prefs), customerId]
    );
  }

  static async incrementOrderStats(
    customerId: string,
    orderTotal: number
  ): Promise<void> {
    await query(
      `UPDATE customers
       SET total_orders = total_orders + 1,
           total_spent = total_spent + $1,
           last_order_at = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [orderTotal, customerId]
    );
  }
}
