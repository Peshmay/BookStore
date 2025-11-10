# Bookstore TDD Integration Tests

A tiny in-memory bookstore built with ES Modules and driven by integration tests.
It demonstrates test-first development, error handling across integration points, and a few advanced features (coupons, shipping, wishlist, email notifications, order history).

Features
Core flows:
Search books
Add to cart (no pre-payment stock mutation)
Calculate totals (subtotal, discount, shipping, tax, total)
Process payment (deterministic for tests)
Update inventory atomically

Advanced:
Coupons (SAVE10, FLAT5)
Shipping (standard, express, pickup)
Wishlist (add / remove / move to cart)
Email notifications (simulated outbox)
Order history (saved on success)
Low-stock alerts after purchase

Install dependencies:
npm install

Running Tests
npm test
