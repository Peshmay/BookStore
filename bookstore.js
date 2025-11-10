const initialBooks = [
  { id: 1, title: 'JavaScript Essentials', author: 'John Doe', price: 30, stock: 5 },
  { id: 2, title: 'Learning Python', author: 'Jane Roe', price: 35, stock: 3 },
  { id: 3, title: 'Web Development with Node.js', author: 'Alice Smith', price: 40, stock: 2 },
  { id: 4, title: 'Data Structures in C', author: 'Bob Brown', price: 25, stock: 4 },
  { id: 5, title: 'Introduction to AI', author: 'Chris Green', price: 50, stock: 1 },
];

let books = initialBooks.map(b => ({ ...b }));
let cart = []; // [{ bookId, quantity, unitPrice }]

//Advanced feature config
const coupons = Object.freeze({
  SAVE10: { type: 'percent', value: 10 }, // 10% off
  FLAT5: { type: 'flat', value: 5 },      // $5 off
});

const shippingOptions = Object.freeze({
  standard: 5,
  express: 15,
  pickup: 0,
});

const TAX_RATE = 0.10;

//Helpers
const getBookById = (id) => books.find(b => b.id === id);
const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

//Core functions
const searchBooks = (query = '') => {
  const q = String(query).trim().toLowerCase();
  if (!q) return deepClone(books);
  return books
    .filter(b =>
      b.title.toLowerCase().includes(q) ||
      b.author.toLowerCase().includes(q)
    )
    .map(b => ({ ...b }));
};

const addToCart = (bookId, quantity) => {
  const book = getBookById(bookId);
  if (!book) throw new Error('Book not found');
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error('Quantity must be a positive integer');
  }
  // Do NOT mutate inventory here; inventory only updates after successful payment.
  const existing = cart.find(i => i.bookId === bookId);
  if (existing) {
    // Check inventory capacity before allowing cart increase
    const totalRequested = existing.quantity + quantity;
    if (totalRequested > book.stock) {
      throw new Error('Requested quantity exceeds stock');
    }
    existing.quantity += quantity;
  } else {
    if (quantity > book.stock) throw new Error('Requested quantity exceeds stock');
    cart.push({ bookId, quantity, unitPrice: book.price });
  }
  return deepClone(cart);
};

const calculateTotal = (
  givenCart,
  { couponCode = null, shippingOption = 'standard' } = {}
) => {
  const items = givenCart ?? cart;
  if (!Array.isArray(items)) throw new Error('Cart must be an array');

  const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

  // Discounts
  let discount = 0;
  if (couponCode && coupons[couponCode]) {
    const c = coupons[couponCode];
    if (c.type === 'percent') discount = +(subtotal * (c.value / 100)).toFixed(2);
    if (c.type === 'flat') discount = Math.min(subtotal, c.value);
  }

  // Shipping
  const shipping = shippingOptions[shippingOption] ?? shippingOptions.standard;

  // Tax on (subtotal - discount + shipping)
  const taxable = Math.max(0, subtotal - discount) + shipping;
  const tax = +(taxable * TAX_RATE).toFixed(2);

  const total = +(taxable + tax).toFixed(2);

  return {
    items: deepClone(items),
    subtotal: +subtotal.toFixed(2),
    discount: +discount.toFixed(2),
    shipping,
    taxRate: TAX_RATE,
    tax,
    total,
    couponApplied: Boolean(couponCode && coupons[couponCode]),
    shippingOption: shippingOption in shippingOptions ? shippingOption : 'standard',
  };
};

const processPayment = (cartTotal, paymentMethod = {}) => {
  // Deterministic hook for tests:
  // pass paymentMethod.simulate = 'success' | 'fail' to control outcome.
  if (paymentMethod?.simulate === 'success') {
    return { success: true, transactionId: `tx-${Math.random().toString(36).slice(2, 11)}` };
  }
  if (paymentMethod?.simulate === 'fail') {
    return { success: false, transactionId: null, error: 'Simulated failure' };
  }

  // Default simulated behavior: 90% success.
  const success = Math.random() >= 0.1;
  return { success, transactionId: success ? `tx-${Math.random().toString(36).slice(2, 11)}` : null };
};

const updateInventory = (givenCart) => {
  const items = givenCart ?? cart;
  // Validate all lines first (atomicity)
  for (const item of items) {
    const book = getBookById(item.bookId);
    if (!book) throw new Error(`Book not found: ${item.bookId}`);
    if (book.stock < item.quantity) {
      throw new Error(`Out of stock: ${book.title}`);
    }
  }
  // Apply reductions
  for (const item of items) {
    const book = getBookById(item.bookId);
    book.stock -= item.quantity;
  }
  return deepClone(books);
};

// Complete purchase flow
const completePurchase = (
  searchQuery,
  bookId,
  quantity,
  paymentMethod = {}
) => {
  // 1. Search for books
  const results = searchBooks(searchQuery);
  if (!results.length) {
    return { success: false, message: 'No books found matching your search' };
  }
  // confirm the intended book is in search results
  const intended = results.find(b => b.id === bookId);
  if (!intended) {
    return { success: false, message: 'Selected book does not match search results' };
  }

  try {
    // 2. Add to cart
    const updatedCart = addToCart(bookId, quantity);

    // 3. Calculate total (support advanced features via paymentMethod extras)
    const { couponCode = null, shippingOption = 'standard' } = paymentMethod ?? {};
    const breakdown = calculateTotal(updatedCart, { couponCode, shippingOption });

    // 4. Process payment
    const pay = processPayment(breakdown.total, paymentMethod);
    if (!pay.success) {
      return { success: false, message: 'Payment failed', breakdown, transactionId: null };
    }

    // 5. Update inventory (only after success)
    updateInventory(updatedCart);

    // Low stock alerts (<=1 left)
    const lowStockAlerts = updatedCart
      .map(i => getBookById(i.bookId))
      .filter(b => b.stock <= 1)
      .map(b => ({ bookId: b.id, title: b.title, remaining: b.stock }));

    // 6. Return order confirmation (and clear cart)
    const confirmation = {
      success: true,
      message: 'Purchase completed successfully',
      transactionId: pay.transactionId,
      breakdown,
      items: deepClone(updatedCart),
      lowStockAlerts,
    };

    // Clear cart
    cart = [];

    return confirmation;
  } catch (err) {
    return { success: false, message: err?.message || 'Unknown error' };
  }
};

//test 
const getBooks = () => deepClone(books);
const getCart = () => deepClone(cart);
const resetStore = () => {
  books = initialBooks.map(b => ({ ...b }));
  cart = [];
};

export {
  // core
  searchBooks,
  addToCart,
  calculateTotal,
  processPayment,
  updateInventory,
  completePurchase,
  // extras for tests
  getBooks,
  getCart,
  resetStore,
  // feature constants 
  TAX_RATE,
  shippingOptions,
};
