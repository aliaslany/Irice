/**
 * Integration tests against real Postgres. Orders here are constructed
 * directly (not via a full checkout) so these tests focus on the return
 * flow itself — placeOrder's own correctness is checkout.integration.test.ts's
 * job.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/client";
import {
  addresses,
  customers,
  loyaltyLedger,
  lots,
  orderLines,
  orders,
  returnRequests,
  stockMovements,
  varieties,
} from "../../db/schema/index";
import { DomainError } from "../../globals/errors";
import { fromToman } from "../../globals/money";
import { kg } from "../../globals/weight";
import { approveReturn, rejectReturn, requestReturn } from "./returns";

async function resetDb(): Promise<void> {
  await db.execute(
    `truncate table loyalty_ledger, return_requests, order_lines, orders, stock_movements,
     addresses, customers, lots, varieties restart identity cascade`,
  );
}

beforeEach(resetDb);
afterAll(resetDb);

interface Fixture {
  customerId: string;
  lotId: string;
  fulfilledOrderId: string;
}

/** A customer with one fulfilled order (10kg, 300 points earned) of a known lot. */
async function seedFixture(fulfilledDaysAgo: number): Promise<Fixture> {
  const [variety] = await db
    .insert(varieties)
    .values({ slug: "verify-return", nameFa: "برنج آزمایشی", grainType: "long", isPublished: true })
    .returning();
  const [lot] = await db
    .insert(lots)
    .values({
      varietyId: variety!.id,
      code: `RET-${randomUUID().slice(0, 8)}`,
      originProvince: "گیلان",
      originCity: "تالش",
      harvestYear: 1405,
      grade: "momtaz",
      pricePerKgRial: fromToman(600_000),
      quantityOnHandG: kg(90), // 10kg already shipped out of an original 100kg
      status: "active",
    })
    .returning();
  const [customer] = await db.insert(customers).values({ mobile: "09120000050", pointsBalanceCache: 300 }).returning();
  const [address] = await db
    .insert(addresses)
    .values({
      customerId: customer!.id,
      recipientName: "مشتری آزمایشی",
      recipientMobile: "09120000050",
      province: "گیلان",
      city: "رشت",
      line1: "خیابان آزمایشی",
    })
    .returning();

  const fulfilledAt = new Date(Date.now() - fulfilledDaysAgo * 24 * 60 * 60 * 1000);
  const [order] = await db
    .insert(orders)
    .values({
      orderNumber: `IR-RET${randomUUID().slice(0, 4).toUpperCase()}`,
      customerId: customer!.id,
      addressId: address!.id,
      shipRecipientName: address!.recipientName,
      shipRecipientMobile: address!.recipientMobile,
      shipProvince: address!.province,
      shipCity: address!.city,
      shipLine1: address!.line1,
      status: "fulfilled",
      subtotalRial: fromToman(6_000_000),
      shippingFeeRial: fromToman(23_000),
      totalRial: fromToman(6_023_000),
      totalWeightG: kg(10),
      pointsEarned: 300,
      paidAt: fulfilledAt,
      fulfilledAt,
    })
    .returning();
  await db.insert(orderLines).values({
    orderId: order!.id,
    varietyId: variety!.id,
    lotId: lot!.id,
    packSizeG: 10_000,
    packs: 1,
    unitPriceRial: fromToman(6_000_000),
    lineTotalRial: fromToman(6_000_000),
    lineWeightG: kg(10),
  });

  return { customerId: customer!.id, lotId: lot!.id, fulfilledOrderId: order!.id };
}

describe("requestReturn()", () => {
  it("creates a request within the 10-day window", async () => {
    const fx = await seedFixture(3);
    const request = await requestReturn({
      orderId: fx.fulfilledOrderId,
      customerId: fx.customerId,
      reason: "کیفیت برنج مطابق انتظار نبود",
    });
    expect(request.status).toBe("requested");
  });

  it("refuses a request past the 10-day window", async () => {
    const fx = await seedFixture(11);
    await expect(
      requestReturn({ orderId: fx.fulfilledOrderId, customerId: fx.customerId, reason: "دیر شد" }),
    ).rejects.toThrow(DomainError);
  });

  it("refuses a second open request for the same order", async () => {
    const fx = await seedFixture(2);
    await requestReturn({ orderId: fx.fulfilledOrderId, customerId: fx.customerId, reason: "اول" });
    await expect(
      requestReturn({ orderId: fx.fulfilledOrderId, customerId: fx.customerId, reason: "دوم" }),
    ).rejects.toThrow(DomainError);
  });

  it("refuses an order belonging to a different customer", async () => {
    const fx = await seedFixture(2);
    await expect(
      requestReturn({ orderId: fx.fulfilledOrderId, customerId: randomUUID(), reason: "نه سفارش من" }),
    ).rejects.toThrow(DomainError);
  });
});

describe("approveReturn()", () => {
  it("restocks the lot, reverses points, and marks the order returned", async () => {
    const fx = await seedFixture(2);
    const request = await requestReturn({
      orderId: fx.fulfilledOrderId,
      customerId: fx.customerId,
      reason: "بسته آسیب دیده بود",
    });

    const [lotBefore] = await db.select().from(lots).where(eq(lots.id, fx.lotId));
    expect(lotBefore?.quantityOnHandG).toBe(kg(90));

    await approveReturn(request.id, "بازرسی شد، تأیید شد");

    const [lotAfter] = await db.select().from(lots).where(eq(lots.id, fx.lotId));
    expect(lotAfter?.quantityOnHandG).toBe(kg(100)); // restocked exactly the 10kg

    const movements = await db.select().from(stockMovements).where(eq(stockMovements.lotId, fx.lotId));
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ reason: "return", deltaG: kg(10) });

    const [orderAfter] = await db.select().from(orders).where(eq(orders.id, fx.fulfilledOrderId));
    expect(orderAfter?.status).toBe("returned");

    const [customerAfter] = await db.select().from(customers).where(eq(customers.id, fx.customerId));
    expect(customerAfter?.pointsBalanceCache).toBe(0); // 300 earned, 300 reversed

    const ledgerRows = await db.select().from(loyaltyLedger).where(eq(loyaltyLedger.customerId, fx.customerId));
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0]).toMatchObject({ reason: "return_reversal", deltaPoints: -300 });

    const [requestAfter] = await db.select().from(returnRequests).where(eq(returnRequests.id, request.id));
    expect(requestAfter?.status).toBe("completed");
    expect(requestAfter?.refundRial).toBe(orderAfter?.totalRial);
  });

  it("refuses to approve the same request twice", async () => {
    const fx = await seedFixture(2);
    const request = await requestReturn({ orderId: fx.fulfilledOrderId, customerId: fx.customerId, reason: "x" });
    await approveReturn(request.id);
    await expect(approveReturn(request.id)).rejects.toThrow(DomainError);

    // Stock was restocked exactly once, not twice.
    const [lotAfter] = await db.select().from(lots).where(eq(lots.id, fx.lotId));
    expect(lotAfter?.quantityOnHandG).toBe(kg(100));
  });

  it("refuses to approve a return whose order was cancelled after the request was opened", async () => {
    // The order state machine has no "cancelled -> returned" transition; this
    // proves approveReturn goes through it rather than force-writing the
    // column, so the request would need to be resolved out of band instead
    // of silently corrupting the order's status.
    const fx = await seedFixture(2);
    const request = await requestReturn({ orderId: fx.fulfilledOrderId, customerId: fx.customerId, reason: "x" });
    await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, fx.fulfilledOrderId));

    await expect(approveReturn(request.id)).rejects.toThrow(DomainError);

    const [lotAfter] = await db.select().from(lots).where(eq(lots.id, fx.lotId));
    expect(lotAfter?.quantityOnHandG).toBe(kg(90)); // never restocked
  });
});

describe("rejectReturn()", () => {
  it("closes the request without touching stock or points", async () => {
    const fx = await seedFixture(2);
    const request = await requestReturn({ orderId: fx.fulfilledOrderId, customerId: fx.customerId, reason: "x" });
    await rejectReturn(request.id, "کیسه باز شده بود، مطابق سیاست قابل بازگشت نیست");

    const [requestAfter] = await db.select().from(returnRequests).where(eq(returnRequests.id, request.id));
    expect(requestAfter?.status).toBe("rejected");

    const [lotAfter] = await db.select().from(lots).where(eq(lots.id, fx.lotId));
    expect(lotAfter?.quantityOnHandG).toBe(kg(90)); // untouched

    const [customerAfter] = await db.select().from(customers).where(eq(customers.id, fx.customerId));
    expect(customerAfter?.pointsBalanceCache).toBe(300); // untouched
  });

  it("requires a note explaining the rejection", async () => {
    const fx = await seedFixture(2);
    const request = await requestReturn({ orderId: fx.fulfilledOrderId, customerId: fx.customerId, reason: "x" });
    await expect(rejectReturn(request.id, "")).rejects.toThrow(DomainError);
  });
});
