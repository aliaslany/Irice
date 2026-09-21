-- Schema invariant checks, run by CI against a freshly migrated database.
--
-- Each block asserts that the database itself refuses a bad write. These are
-- not unit tests of application code: they prove that a bug, a race, or a
-- direct psql session cannot put the catalog into an impossible state.
--
-- Run with: psql -v ON_ERROR_STOP=1 -f scripts/verify-constraints.sql
\set QUIET on
BEGIN;

CREATE OR REPLACE FUNCTION assert_rejected(stmt text, expected_constraint text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN check_violation OR unique_violation OR foreign_key_violation THEN
    IF SQLERRM NOT LIKE '%' || expected_constraint || '%' THEN
      RAISE EXCEPTION 'expected constraint % but got: %', expected_constraint, SQLERRM;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'statement was accepted but should have been rejected by %', expected_constraint;
END;
$$;

-- Fixtures: one variety, one sellable lot.
INSERT INTO varieties (id, slug, name_fa, grain_type, is_published)
  VALUES ('11111111-1111-1111-1111-111111111111', 'verify-tarom', 'طارم هاشمی', 'long', true);

INSERT INTO lots (id, variety_id, code, origin_province, origin_city, harvest_year, grade,
                  price_per_kg_rial, quantity_on_hand_g, status)
  VALUES ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
          'VERIFY-1405-01', 'مازندران', 'فریدون‌کنار', 1405, 'momtaz', 5930000, 500000, 'active');

-- A harvest year must be Jalali. A Gregorian 2026 here would silently make
-- every lot look 600 years old to the FEFO sort.
SELECT assert_rejected($$
  INSERT INTO lots (variety_id, code, origin_province, origin_city, harvest_year, grade, price_per_kg_rial)
  VALUES ('11111111-1111-1111-1111-111111111111', 'VERIFY-BAD-YEAR', 'گیلان', 'تالش', 2026, 'darajeh_yek', 5000000)
$$, 'lots_harvest_year_jalali');

-- Overselling is a database error, not a race to lose.
SELECT assert_rejected($$
  UPDATE lots SET quantity_reserved_g = 600000 WHERE code = 'VERIFY-1405-01'
$$, 'lots_reserved_within_on_hand');

SELECT assert_rejected($$
  UPDATE lots SET quantity_on_hand_g = -1 WHERE code = 'VERIFY-1405-01'
$$, 'lots_on_hand_non_negative');

-- A zero or negative price must never reach a storefront.
SELECT assert_rejected($$
  UPDATE lots SET price_per_kg_rial = 0 WHERE code = 'VERIFY-1405-01'
$$, 'lots_price_positive');

-- Stock that moves without a customer-visible cause must be explained.
SELECT assert_rejected($$
  INSERT INTO stock_movements (lot_id, delta_g, reason, idempotency_key, created_by)
  VALUES ('22222222-2222-2222-2222-222222222222', -5000, 'shrinkage', 'verify-shrink', 'ci')
$$, 'stock_movements_explained');

INSERT INTO stock_movements (lot_id, delta_g, reason, idempotency_key, note, created_by)
  VALUES ('22222222-2222-2222-2222-222222222222', -5000, 'shrinkage', 'verify-shrink-ok',
          'moisture loss in store', 'ci');

-- A zero-gram movement is a bug, not a no-op.
SELECT assert_rejected($$
  INSERT INTO stock_movements (lot_id, delta_g, reason, idempotency_key, created_by)
  VALUES ('22222222-2222-2222-2222-222222222222', 0, 'intake', 'verify-zero', 'ci')
$$, 'stock_movements_delta_non_zero');

-- A replayed payment callback must not move stock twice.
INSERT INTO stock_movements (lot_id, delta_g, reason, idempotency_key, created_by)
  VALUES ('22222222-2222-2222-2222-222222222222', -10000, 'sale', 'verify-order:line-1', 'ci');
SELECT assert_rejected($$
  INSERT INTO stock_movements (lot_id, delta_g, reason, idempotency_key, created_by)
  VALUES ('22222222-2222-2222-2222-222222222222', -10000, 'sale', 'verify-order:line-1', 'ci')
$$, 'stock_movements_idempotency_key_unique');

-- One pack size per lot; a duplicate would split stock across two prices.
INSERT INTO skus (lot_id, pack_size_g, price_rial)
  VALUES ('22222222-2222-2222-2222-222222222222', 10000, 59300000);
SELECT assert_rejected($$
  INSERT INTO skus (lot_id, pack_size_g, price_rial)
  VALUES ('22222222-2222-2222-2222-222222222222', 10000, 59300000)
$$, 'skus_lot_pack_unique');

-- A lot with orders against it must not be deletable.
SELECT assert_rejected($$
  DELETE FROM varieties WHERE slug = 'verify-tarom'
$$, 'lots_variety_id_varieties_id_fk');

-- --- Phase 2: commerce, identity, loyalty ---

INSERT INTO customers (id, mobile)
  VALUES ('33333333-3333-3333-3333-333333333333', '09120000099');

-- An OTP code can be guessed at most 5 times.
SELECT assert_rejected($$
  INSERT INTO otp_codes (mobile, code_hash, attempts, expires_at)
  VALUES ('09120000099', 'x', 6, now() + interval '2 minutes')
$$, 'otp_codes_attempts_bounded');

-- A cart line of zero or negative packs is a bug, not an empty line.
INSERT INTO carts (id, cart_token) VALUES ('44444444-4444-4444-4444-444444444444', 'verify-cart');
SELECT assert_rejected($$
  INSERT INTO cart_items (cart_id, variety_id, pack_size_g, quantity)
  VALUES ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 10000, 0)
$$, 'cart_items_quantity_positive');

-- A hold of zero or negative grams is a bug, not a no-op hold.
INSERT INTO orders (id, order_number, customer_id, ship_recipient_name, ship_recipient_mobile,
                    ship_province, ship_city, ship_line1, subtotal_rial, shipping_fee_rial,
                    total_rial, total_weight_g)
  VALUES ('55555555-5555-5555-5555-555555555555', 'IR-VERIFY', '33333333-3333-3333-3333-333333333333',
          'گیرنده آزمایشی', '09120000099', 'گیلان', 'رشت', 'خیابان آزمایشی', 59300000, 230000,
          59530000, 10000);
SELECT assert_rejected($$
  INSERT INTO stock_reservations (lot_id, quantity_g, order_id, expires_at, idempotency_key)
  VALUES ('22222222-2222-2222-2222-222222222222', 0, '55555555-5555-5555-5555-555555555555',
          now() + interval '20 minutes', 'verify-reservation')
$$, 'stock_reservations_quantity_positive');

-- A discount can never exceed what it's discounting.
SELECT assert_rejected($$
  UPDATE orders SET discount_rial = 99999999999 WHERE id = '55555555-5555-5555-5555-555555555555'
$$, 'orders_discount_bounded');

-- A points ledger entry of zero is a bug, and a manual adjustment without a
-- reason is exactly the unaccountable balance change the append-only ledger
-- exists to prevent.
SELECT assert_rejected($$
  INSERT INTO loyalty_ledger (customer_id, delta_points, reason, idempotency_key)
  VALUES ('33333333-3333-3333-3333-333333333333', 0, 'earn_purchase', 'verify-zero-points')
$$, 'loyalty_ledger_delta_non_zero');
SELECT assert_rejected($$
  INSERT INTO loyalty_ledger (customer_id, delta_points, reason, idempotency_key)
  VALUES ('33333333-3333-3333-3333-333333333333', -100, 'adjustment', 'verify-unexplained-adjustment')
$$, 'loyalty_ledger_adjustment_explained');

-- The same badge can't unlock twice for one customer.
INSERT INTO customer_badges (customer_id, badge_code)
  VALUES ('33333333-3333-3333-3333-333333333333', 'first_harvest');
SELECT assert_rejected($$
  INSERT INTO customer_badges (customer_id, badge_code)
  VALUES ('33333333-3333-3333-3333-333333333333', 'first_harvest')
$$, 'customer_badges_customer_badge_unique');

-- --- Phase 3: returns and reviews ---

-- A star rating outside 1-5 must never reach the average shown to shoppers.
SELECT assert_rejected($$
  INSERT INTO reviews (variety_id, customer_id, order_id, rating)
  VALUES ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333',
          '55555555-5555-5555-5555-555555555555', 6)
$$, 'reviews_rating_range');

-- One review per customer per variety — a second submission is an edit
-- request, never a second vote.
INSERT INTO reviews (variety_id, customer_id, order_id, rating)
  VALUES ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333',
          '55555555-5555-5555-5555-555555555555', 5);
SELECT assert_rejected($$
  INSERT INTO reviews (variety_id, customer_id, order_id, rating)
  VALUES ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333',
          '55555555-5555-5555-5555-555555555555', 4)
$$, 'reviews_customer_variety_unique');

-- A refund can never be negative — that would be charging the customer more.
INSERT INTO return_requests (order_id, customer_id, reason)
  VALUES ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333',
          'بسته آسیب دیده بود');
SELECT assert_rejected($$
  UPDATE return_requests SET refund_rial = -1
  WHERE order_id = '55555555-5555-5555-5555-555555555555'
$$, 'return_requests_refund_non_negative');

ROLLBACK;
\echo 'schema invariants: all checks passed'
