import { Store, Customer, Cart } from '../types';
/**
 * Build the system prompt injected into every Claude API call.
 * Includes store config, language rules, behavioral guidelines,
 * and current cart state.
 */
export declare function buildSystemPrompt(store: Store, customer: Customer, currentCart: Cart | null): string;
export declare function buildCartSummaryForPrompt(cart: Cart | null, language: string): string;
//# sourceMappingURL=prompts.d.ts.map