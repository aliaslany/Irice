/**
 * Integration tests against a real Postgres database (DATABASE_URL).
 *
 * These exercise the actual transactions — row locks, check constraints,
 * idempotency keys — not mocks. This is the module the person who asked for
 * this build named as their own weak spot, so it gets the highest bar of
 * verification in the codebase: every claim below is checked against real
 * database state after the call, not just against a returned value.
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/client";
import {
  addresses,
  cartItems,
  carts,
  customerBadges,
  customers,
  lots,
  loyaltyLedger,
  orderLines,
  orders,
  payments,
  skus,
  stockMovements,
  stockReservations,
  varieties,
} from "../../db/schema/index";
import { fromToman } from "../../globals/money";
import { kg } from "../../globals/weight";
import { DomainError } from "../../globals/errors";
import { derivePrice } from "../pricing/price";
import { FakePaymentProvider, recordFakeOutcome, resetPaymentProviderCache } from "../payments";
import { cancelOrder, placeOrder, retryPayment, verifyPayment } from "./checkout";

const SITE_URL = "https://test.irice.local";

async function resetDb(): Promise<void> {
  await db.execute(`truncate table
    loyalty_ledger, customer_badges, payments, order_lines, orders,
    stock_reservations, stock_movements, cart_items, carts, addresses,
    otp_codes, customers, skus, lot_certificates, lot_price_history, lots, varieties
    restart identity cascade`);
}

interface Fixture {
  varietyId: string;
  varietySlug: string;
  lotId: string;
  lotCode: string;
  customerId: string;
  addressId: string;
}

/** One variety, one lot with a known price, one customer with one address. */
async function seedFixture(overrides: { quantityKg?: number; pricePerKgToman?: number } = {}): Promise<Fixture> {
  const pricePerKgRial = fromToman(overrides.pricePerKgToman ?? 600_000);
  const quantityOnHandG = kg(overrides.quantityKg ?? 100);

  const [variety] = await db
    .insert(varieties)
    .values({ slug: "test-variety", nameFa: "برنج آزمایشی", grainType: "long", isPublished: true })
    .returning();
  const [lot] = await db
    .insert(lots)
    .values({
      varietyId: variety!.id,
      code: "TEST-1405-01",
      originProvince: "گیلان",
      originCity: "تالش",
      harvestYear: 1405,
      grade: "momtaz",
      pricePerKgRial,
      quantityOnHandG,
      status: "active",
    })
    .returning();

  for (const packSizeG of [1000, 5000, 10_000, 20_000]) {
    const { totalRial } = derivePrice({ pricePerKgRial, packSizeG: kg(packSizeG / 1000) });
    await db.insert(skus).values({ lotId: lot!.id, packSizeG, priceRial: totalRial, isActive: true });
  }

  const [customer] = await db.insert(customers).values({ mobile: "09120000001" }).returning();
  const [address] = await db
    .insert(addresses)
    .values({
      customerId: customer!.id,
      recipientName: "مشتری آزمایشی",
      recipientMobile: "09120000001",
      province: "گیلان",
      city: "رشت",
      line1: "خیابان آزمایشی، پلاک ۱",
      isDefault: true,
    })
    .returning();

  return {
    varietyId: variety!.id,
    varietySlug: variety!.slug,
    lotId: lot!.id,
    lotCode: lot!.code,
    customerId: customer!.id,
    addressId: address!.id,
  };
}

async function seedCart(customerId: string, varietyId: string, packSizeG: number, quantity: number) {
  // A distinct token every call: a customer can have more than one cart
  // sequentially in a test (e.g. a second order after the first one paid).
  const [cart] = await db.insert(carts).values({ cartToken: randomUUID(), customerId }).returning();
  await db.insert(cartItems).values({ cartId: cart!.id, varietyId, packSizeG, quantity });
  return cart!.id;
}

beforeAll(() => {
  resetPaymentProviderCache();
});

beforeEach(async () => {
  await resetDb();
});

// Leaves the dev database clean after the file's last test, so test
// fixtures ('split-variety', throwaway customers) never linger to
// pollute a manual inspection of the database or, worse, get baked
// into a static page built shortly after the suite runs.
afterAll(async () => {
  await resetDb();
});

describe("placeOrder() + verifyPayment(): the happy path", () => {
  it("reserves stock, charges the snapshotted price, and leaves an auditable trail", async () => {
    const fx = await seedFixture({ quantityKg: 100, pricePerKgToman: 600_000 });
    const cartId = await seedCart(fx.customerId, fx.varietyId, 10_000, 2); // 2 packs of 10kg

    const placed = await placeOrder({
      cartId,
      customerId: fx.customerId,
      addressId: fx.addressId,
      pointsToRedeem: 0,
      siteUrl: SITE_URL,
    });

    expect(placed.orderNumber).toMatch(/^IR-/);
    expect(placed.redirectUrl).toContain("/pay/fake/");

    const [order] = await db.select().from(orders).where(eq(orders.id, placed.orderId));
    expect(order?.status).toBe("pending_payment");
    expect(order?.totalWeightG).toBe(kg(20));

    // The cart must be emptied immediately at checkout, not at payment.
    const remainingCartItems = await db.select().from(cartItems).where(eq(cartItems.cartId, cartId));
    expect(remainingCartItems).toHaveLength(0);

    // Reservation exists and the lot's reserved counter reflects it.
    const reservations = await db
      .select()
      .from(stockReservations)
      .where(eq(stockReservations.orderId, placed.orderId));
    expect(reservations).toHaveLength(1);
    expect(reservations[0]?.status).toBe("active");
    expect(reservations[0]?.quantityG).toBe(kg(20));

    const [lotAfterReserve] = await db.select().from(lots).where(eq(lots.id, fx.lotId));
    expect(lotAfterReserve?.quantityReservedG).toBe(kg(20));
    expect(lotAfterReserve?.quantityOnHandG).toBe(kg(100)); // reservation never touches on_hand

    const [payment] = await db.select().from(payments).where(eq(payments.orderId, placed.orderId));
    expect(payment?.status).toBe("pending");
    expect(payment?.provider).toBe("fake");

    // --- pay ---
    const authority = placed.redirectUrl.split("/pay/fake/")[1]!;
    await recordFakeOutcome(authority, "success");
    const verified = await verifyPayment(authority, SITE_URL);

    expect(verified.success).toBe(true);
    expect(verified.reward?.pointsEarned).toBeGreaterThan(0);
    expect(verified.reward?.newBadges.map((b) => b.code)).toContain("first_harvest");

    const [orderAfterPay] = await db.select().from(orders).where(eq(orders.id, placed.orderId));
    expect(orderAfterPay?.status).toBe("paid");
    expect(orderAfterPay?.paidAt).not.toBeNull();
    expect(orderAfterPay?.pointsEarned).toBe(verified.reward?.pointsEarned);

    // on_hand actually decreased by exactly the weight sold; reserved is back to zero.
    const [lotAfterPay] = await db.select().from(lots).where(eq(lots.id, fx.lotId));
    expect(lotAfterPay?.quantityOnHandG).toBe(kg(80));
    expect(lotAfterPay?.quantityReservedG).toBe(0);

    const [reservationAfterPay] = await db
      .select()
      .from(stockReservations)
      .where(eq(stockReservations.orderId, placed.orderId));
    expect(reservationAfterPay?.status).toBe("consumed");

    // Exactly one `sale` stock_movement, matching the weight sold, tagged to this order.
    const movements = await db.select().from(stockMovements).where(eq(stockMovements.orderId, placed.orderId));
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ reason: "sale", deltaG: -kg(20) });

    // Points ledger and cache agree.
    const ledgerRows = await db.select().from(loyaltyLedger).where(eq(loyaltyLedger.customerId, fx.customerId));
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0]?.reason).toBe("earn_purchase");
    const [customerAfter] = await db.select().from(customers).where(eq(customers.id, fx.customerId));
    expect(customerAfter?.pointsBalanceCache).toBe(ledgerRows[0]!.deltaPoints);
    expect(customerAfter?.totalKgPurchasedCache).toBe(20);

    const badges = await db.select().from(customerBadges).where(eq(customerBadges.customerId, fx.customerId));
    expect(badges.map((b) => b.badgeCode)).toContain("first_harvest");
  });

  it("is idempotent: replaying the same successful callback changes nothing further", async () => {
    const fx = await seedFixture();
    const cartId = await seedCart(fx.customerId, fx.varietyId, 10_000, 1);
    const placed = await placeOrder({
      cartId,
      customerId: fx.customerId,
      addressId: fx.addressId,
      pointsToRedeem: 0,
      siteUrl: SITE_URL,
    });
    const authority = placed.redirectUrl.split("/pay/fake/")[1]!;
    await recordFakeOutcome(authority, "success");

    const first = await verifyPayment(authority, SITE_URL);
    const second = await verifyPayment(authority, SITE_URL);

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(second.reward).toBeUndefined(); // nothing new to celebrate on replay

    const [lotAfter] = await db.select().from(lots).where(eq(lots.id, fx.lotId));
    expect(lotAfter?.quantityOnHandG).toBe(kg(90)); // decremented exactly once, not twice

    const movements = await db.select().from(stockMovements).where(eq(stockMovements.orderId, placed.orderId));
    expect(movements).toHaveLength(1);

    const ledgerRows = await db.select().from(loyaltyLedger).where(eq(loyaltyLedger.customerId, fx.customerId));
    expect(ledgerRows).toHaveLength(1); // earned once, not twice
  });
});

describe("placeOrder(): stock exhaustion", () => {
  it("refuses to allocate a partial order and leaves no trace on failure", async () => {
    const fx = await seedFixture({ quantityKg: 15 }); // only one whole 10kg pack available
    const cartId = await seedCart(fx.customerId, fx.varietyId, 10_000, 2); // asks for two

    await expect(
      placeOrder({ cartId, customerId: fx.customerId, addressId: fx.addressId, pointsToRedeem: 0, siteUrl: SITE_URL }),
    ).rejects.toThrow(DomainError);

    // Nothing was created: no order, no reservation, no reserved grams, and
    // — because the whole allocation ran inside one transaction — the cart
    // still has its item, so the customer can simply try again.
    const orderRows = await db.select().from(orders);
    expect(orderRows).toHaveLength(0);
    const [lotAfter] = await db.select().from(lots).where(eq(lots.id, fx.lotId));
    expect(lotAfter?.quantityReservedG).toBe(0);
    const remainingCartItems = await db.select().from(cartItems).where(eq(cartItems.cartId, cartId));
    expect(remainingCartItems).toHaveLength(1);
  });
});

describe("payment failure and retry", () => {
  it("keeps the reservation alive after a failed attempt so a retry can reuse it", async () => {
    const fx = await seedFixture();
    const cartId = await seedCart(fx.customerId, fx.varietyId, 10_000, 1);
    const placed = await placeOrder({
      cartId,
      customerId: fx.customerId,
      addressId: fx.addressId,
      pointsToRedeem: 0,
      siteUrl: SITE_URL,
    });
    const authority = placed.redirectUrl.split("/pay/fake/")[1]!;
    await recordFakeOutcome(authority, "failure");

    const result = await verifyPayment(authority, SITE_URL);
    expect(result.success).toBe(false);

    const [orderAfterFail] = await db.select().from(orders).where(eq(orders.id, placed.orderId));
    expect(orderAfterFail?.status).toBe("payment_failed");

    // The hold is untouched — a retry must not need to re-check stock.
    const [lotAfterFail] = await db.select().from(lots).where(eq(lots.id, fx.lotId));
    expect(lotAfterFail?.quantityReservedG).toBe(kg(10));

    const retried = await retryPayment(placed.orderId, SITE_URL);
    expect(retried.redirectUrl).toContain("/pay/fake/");

    const [orderAfterRetry] = await db.select().from(orders).where(eq(orders.id, placed.orderId));
    expect(orderAfterRetry?.status).toBe("pending_payment");

    const newAuthority = retried.redirectUrl.split("/pay/fake/")[1]!;
    await recordFakeOutcome(newAuthority, "success");
    const secondAttempt = await verifyPayment(newAuthority, SITE_URL);
    expect(secondAttempt.success).toBe(true);

    const [lotAfterSuccess] = await db.select().from(lots).where(eq(lots.id, fx.lotId));
    expect(lotAfterSuccess?.quantityOnHandG).toBe(kg(90));
    expect(lotAfterSuccess?.quantityReservedG).toBe(0);
  });
});

describe("cancelOrder()", () => {
  it("releases the hold and refunds any redeemed points", async () => {
    const fx = await seedFixture();

    // Give the customer points to redeem: an initial small purchase.
    const cartId1 = await seedCart(fx.customerId, fx.varietyId, 20_000, 1);
    const placed1 = await placeOrder({
      cartId: cartId1,
      customerId: fx.customerId,
      addressId: fx.addressId,
      pointsToRedeem: 0,
      siteUrl: SITE_URL,
    });
    const auth1 = placed1.redirectUrl.split("/pay/fake/")[1]!;
    await recordFakeOutcome(auth1, "success");
    await verifyPayment(auth1, SITE_URL);

    const [customerWithPoints] = await db.select().from(customers).where(eq(customers.id, fx.customerId));
    const balanceBefore = customerWithPoints!.pointsBalanceCache;
    expect(balanceBefore).toBeGreaterThan(0);

    const cartId2 = await seedCart(fx.customerId, fx.varietyId, 1000, 1);
    const placed2 = await placeOrder({
      cartId: cartId2,
      customerId: fx.customerId,
      addressId: fx.addressId,
      pointsToRedeem: balanceBefore,
      siteUrl: SITE_URL,
    });

    const [order2] = await db.select().from(orders).where(eq(orders.id, placed2.orderId));
    expect(order2?.pointsRedeemed).toBeGreaterThan(0);

    const [customerAfterRedeem] = await db.select().from(customers).where(eq(customers.id, fx.customerId));
    expect(customerAfterRedeem?.pointsBalanceCache).toBe(balanceBefore - order2!.pointsRedeemed);

    await cancelOrder(placed2.orderId, fx.customerId);

    const [customerAfterCancel] = await db.select().from(customers).where(eq(customers.id, fx.customerId));
    expect(customerAfterCancel?.pointsBalanceCache).toBe(balanceBefore); // refunded in full

    const [orderAfterCancel] = await db.select().from(orders).where(eq(orders.id, placed2.orderId));
    expect(orderAfterCancel?.status).toBe("cancelled");

    const [lotAfterCancel] = await db.select().from(lots).where(eq(lots.id, fx.lotId));
    expect(lotAfterCancel?.quantityReservedG).toBe(0); // hold released
  });
});

describe("multi-lot FEFO allocation", () => {
  it("splits one cart line across two harvest years and prices each half correctly", async () => {
    const [variety] = await db
      .insert(varieties)
      .values({ slug: "split-variety", nameFa: "برنج دو‌محموله", grainType: "long", isPublished: true })
      .returning();

    const oldPricePerKg = fromToman(500_000);
    const newPricePerKg = fromToman(600_000);
    const [oldLot] = await db
      .insert(lots)
      .values({
        varietyId: variety!.id,
        code: "SPLIT-1404-01",
        originProvince: "گیلان",
        originCity: "تالش",
        harvestYear: 1404,
        grade: "darajeh_yek",
        pricePerKgRial: oldPricePerKg,
        quantityOnHandG: kg(12), // 1 whole 10kg pack
        status: "active",
      })
      .returning();
    const [newLot] = await db
      .insert(lots)
      .values({
        varietyId: variety!.id,
        code: "SPLIT-1405-01",
        originProvince: "گیلان",
        originCity: "تالش",
        harvestYear: 1405,
        grade: "momtaz",
        pricePerKgRial: newPricePerKg,
        quantityOnHandG: kg(100),
        status: "active",
      })
      .returning();
    const { totalRial: oldPackPrice } = derivePrice({ pricePerKgRial: oldPricePerKg, packSizeG: kg(10) });
    const { totalRial: newPackPrice } = derivePrice({ pricePerKgRial: newPricePerKg, packSizeG: kg(10) });
    await db.insert(skus).values([
      { lotId: oldLot!.id, packSizeG: 10_000, priceRial: oldPackPrice, isActive: true },
      { lotId: newLot!.id, packSizeG: 10_000, priceRial: newPackPrice, isActive: true },
    ]);

    const [customer] = await db.insert(customers).values({ mobile: "09120000002" }).returning();
    const [address] = await db
      .insert(addresses)
      .values({
        customerId: customer!.id,
        recipientName: "مشتری دوم",
        recipientMobile: "09120000002",
        province: "تهران",
        city: "تهران",
        line1: "خیابان دوم",
      })
      .returning();

    const cartId = await seedCart(customer!.id, variety!.id, 10_000, 3); // needs 3 packs; old lot has 1
    const placed = await placeOrder({
      cartId,
      customerId: customer!.id,
      addressId: address!.id,
      pointsToRedeem: 0,
      siteUrl: SITE_URL,
    });

    const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, placed.orderId));
    expect(lines).toHaveLength(2); // split across both lots

    const oldLine = lines.find((l) => l.lotId === oldLot!.id);
    const newLine = lines.find((l) => l.lotId === newLot!.id);
    expect(oldLine).toMatchObject({ packs: 1, unitPriceRial: oldPackPrice });
    expect(newLine).toMatchObject({ packs: 2, unitPriceRial: newPackPrice });

    const [orderRow] = await db.select().from(orders).where(eq(orders.id, placed.orderId));
    expect(orderRow?.subtotalRial).toBe(oldPackPrice + newPackPrice * 2);
  });
});
