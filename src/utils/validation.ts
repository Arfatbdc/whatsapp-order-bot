/**
 * Input validation schemas using Zod.
 */
import { z } from 'zod';

export const PhoneSchema = z
  .string()
  .regex(/^[\d+]{7,15}$/, 'Invalid phone number');

export const UUIDSchema = z
  .string()
  .uuid('Invalid UUID');

export const CreateOrderSchema = z.object({
  deliveryAddress: z.object({
    address: z.string().min(5).max(500),
    zone: z.string().min(1).max(100),
    label: z.string().max(50).optional(),
  }),
  paymentMethod: z.enum(['cash', 'cod', 'card', 'mada', 'apple_pay', 'stc_pay']),
  notes: z.string().max(500).optional(),
});

export const ProductSearchSchema = z.object({
  query: z.string().min(1).max(200),
  category: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).default(10),
});

export const PromoCodeSchema = z
  .string()
  .min(3).max(30)
  .regex(/^[A-Z0-9_-]+$/, 'Promo code must be uppercase alphanumeric');

export function safeValidate<T>(schema: z.ZodType<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error.issues.map((e: { message: string }) => e.message).join(', ') };
}
