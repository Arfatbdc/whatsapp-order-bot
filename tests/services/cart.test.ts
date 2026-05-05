import { CartService } from '../../src/services/cart';
import * as connection from '../../src/database/connection';
import * as redis from '../../src/database/redis';

const mockQueryOne = connection.queryOne as jest.Mock;
const mockGetCachedCart = redis.getCachedCart as jest.Mock;
const mockCacheCart = redis.cacheCart as jest.Mock;

const fakeCart = {
  id: '11111111-1111-1111-1111-111111111111',
  store_id: 'store-1',
  customer_id: 'customer-1',
  items: [],
  subtotal: 0,
  discount: 0,
  promo_code: null,
  expires_at: new Date(),
};

const fakeProduct = {
  id: 'prod-1',
  name_ar: 'كبسة دجاج',
  name_en: 'Chicken Kabsa',
  price: 42,
  unit: 'portion',
};

describe('CartService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCachedCart.mockResolvedValue(null);
    mockQueryOne.mockResolvedValue(fakeCart);
    mockCacheCart.mockResolvedValue(undefined);
  });

  it('getOrCreate returns cart from DB when cache is empty', async () => {
    const cart = await CartService.getOrCreate('store-1', 'customer-1');
    expect(cart).toBeDefined();
    expect(mockQueryOne).toHaveBeenCalled();
  });

  it('addItem throws when quantity <= 0', async () => {
    await expect(
      CartService.addItem('store-1', 'customer-1', fakeProduct as any, 0)
    ).rejects.toThrow('Quantity must be > 0');
  });

  it('addItem adds product to empty cart', async () => {
    mockQueryOne
      .mockResolvedValueOnce(fakeCart) // getOrCreate DB
      .mockResolvedValueOnce({ ...fakeCart, items: [{ product_id: 'prod-1', quantity: 2 }] }); // persist

    const cart = await CartService.addItem('store-1', 'customer-1', fakeProduct as any, 2);
    expect(cart).toBeDefined();
  });

  it('removeItem filters out the product', async () => {
    const cartWithItem = { ...fakeCart, items: [{ product_id: 'prod-1', name_ar: 'كبسة', name_en: null, price: 42, quantity: 1, unit: 'portion', subtotal: 42 }] };
    mockQueryOne
      .mockResolvedValueOnce(cartWithItem)
      .mockResolvedValueOnce({ ...fakeCart, items: [] });

    const cart = await CartService.removeItem('store-1', 'customer-1', 'prod-1');
    expect(cart.items).toHaveLength(0);
  });
});
