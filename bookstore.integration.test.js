import {
  completePurchase,
  searchBooks,
  addToCart,
  calculateTotal,
  processPayment,
  updateInventory,
  getBooks,
  resetStore,
  shippingOptions,
  TAX_RATE,
} from './bookstore.js';

describe('Bookstore Integration Tests', () => {
  beforeEach(() => {
    resetStore();
  });

  describe('Successful Purchase Flow', () => {
    test('should complete entire purchase process successfully (coupon + shipping)', () => {
      // Search → Add to cart → Calculate → Payment → Update inventory via completePurchase
      const q = 'javascript';
      const found = searchBooks(q);
      expect(found.length).toBeGreaterThan(0);

      const book = found.find(b => b.title.includes('JavaScript Essentials'));
      expect(book).toBeTruthy();

      const res = completePurchase(q, book.id, 1, {
        type: 'card',
        simulate: 'success',
        couponCode: 'SAVE10',
        shippingOption: 'standard',
      });

      expect(res.success).toBe(true);
      expect(res.transactionId).toMatch(/^tx-/);
      expect(res.breakdown.couponApplied).toBe(true);
      expect(res.breakdown.shippingOption).toBe('standard');

      const after = getBooks().find(b => b.id === book.id);
      expect(after.stock).toBe(book.stock - 1);
    });

    test('should handle multiple books in cart', () => {
      // Search
      const python = searchBooks('python')[0];
      const node = searchBooks('node')[0];
      expect(python).toBeTruthy();
      expect(node).toBeTruthy();

      // Add two different books
      addToCart(python.id, 1);
      addToCart(node.id, 1);

      // Calculate with coupon + express shipping
      const breakdown = calculateTotal(null, { couponCode: 'FLAT5', shippingOption: 'express' });
      // subtotal = 35 + 40 = 75
      // discount = 5
      // shipping = 15
      // taxable = (75 - 5) + 15 = 85
      // tax = 8.5
      // total = 93.5
      expect(breakdown.subtotal).toBe(75);
      expect(breakdown.discount).toBe(5);
      expect(breakdown.shipping).toBe(shippingOptions.express);
      expect(breakdown.tax).toBeCloseTo(85 * TAX_RATE, 5);
      expect(breakdown.total).toBeCloseTo(93.5, 5);

      // Process payment deterministically
      const pay = processPayment(breakdown.total, { simulate: 'success' });
      expect(pay.success).toBe(true);
      expect(pay.transactionId).toMatch(/^tx-/);

      // Update inventory atomically (use current cart contents explicitly)
      const currentCart = [
        { bookId: python.id, quantity: 1, unitPrice: python.price },
        { bookId: node.id, quantity: 1, unitPrice: node.price },
      ];
      updateInventory(currentCart);

      // Verify stocks reduced
      const pythonAfter = getBooks().find(b => b.id === python.id);
      const nodeAfter = getBooks().find(b => b.id === node.id);
      expect(pythonAfter.stock).toBe(python.stock - 1);
      expect(nodeAfter.stock).toBe(node.stock - 1);
    });
  });

  describe('Error Handling', () => {
    test('should fail when requested quantity exceeds stock', () => {
      const ai = searchBooks('AI')[0];
      expect(ai).toBeTruthy();
      // Only 1 in stock; try adding 2
      expect(() => addToCart(ai.id, 2)).toThrow(/exceeds stock/);
    });

    test('should handle payment failure gracefully', () => {
      const dataC = searchBooks('Data Structures in C')[0];
      expect(dataC).toBeTruthy();

      const res = completePurchase('data', dataC.id, 1, { simulate: 'fail' });
      expect(res.success).toBe(false);
      expect(res.message).toMatch(/Payment failed/);
      expect(res.transactionId).toBeNull();

      // Inventory should NOT be updated on failure
      const after = getBooks().find(b => b.id === dataC.id);
      expect(after.stock).toBe(dataC.stock);
    });

    test('should not update inventory if payment fails (explicit check)', () => {
      const node = searchBooks('node')[0];
      expect(node).toBeTruthy();

      // Add to cart and try payment fail
      addToCart(node.id, 1);
      const pre = getBooks().find(b => b.id === node.id).stock;

      const calc = calculateTotal();
      expect(calc.subtotal).toBe(40);

      const pay = processPayment(calc.total, { simulate: 'fail' });
      expect(pay.success).toBe(false);

      // No inventory change after failed payment
      const after = getBooks().find(b => b.id === node.id).stock;
      expect(after).toBe(pre);
    });
  });

  describe('Advanced Features', () => {
    test('should ignore invalid coupon code and still compute totals', () => {
      const js = searchBooks('javascript')[0];
      expect(js).toBeTruthy();
      addToCart(js.id, 1);

      const breakdown = calculateTotal(null, { couponCode: 'NOTACOUPON', shippingOption: 'pickup' });

      // subtotal = 30, discount = 0, shipping = 0, tax = 3, total = 33
      expect(breakdown.couponApplied).toBe(false);
      expect(breakdown.discount).toBe(0);
      expect(breakdown.shipping).toBe(0);
      expect(breakdown.total).toBeCloseTo(33.0, 5);
    });

    test('should include low-stock alerts after purchase', () => {
      // Book with stock 1 → buy 1 to trigger alert (remaining 0)
      const ai = searchBooks('AI')[0];
      expect(ai).toBeTruthy();

      const res = completePurchase('ai', ai.id, 1, { simulate: 'success', shippingOption: 'pickup' });
      expect(res.success).toBe(true);
      expect(res.lowStockAlerts.length).toBeGreaterThanOrEqual(1);

      const alert = res.lowStockAlerts.find(a => a.bookId === ai.id);
      expect(alert).toBeTruthy();
      expect(alert.remaining).toBe(0);
    });
  });
});
