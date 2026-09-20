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

ROLLBACK;
\echo 'schema invariants: all checks passed'
