/**
 * Integration tests against real Postgres — the verified-purchase gate is
 * the whole point of this module, so it's tested against real order data,
 * not a mocked "yes they bought it" flag.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/client";
import { customers, lots, orderLines, orders, varieties } from "../../db/schema/index";
import { DomainError } from "../../globals/errors";
import { fromToman } from "../../globals/money";
import { kg } from "../../globals/weight";
import { canReview, getVarietyReviewSummary, listVarietyReviews, submitReview } from "./reviews";

async function resetDb(): Promise<void> {
  await db.execute(
    `truncate table reviews, order_lines, orders, customers, lots, varieties restart identity cascade`,
  );
}

beforeEach(resetDb);
afterAll(resetDb);

async function seedVariety() {
  const [variety] = await db
    .insert(varieties)
    .values({ slug: "verify-review", nameFa: "برنج آزمایشی", grainType: "long", isPublished: true })
    .returning();
  return variety!;
}

async function seedCustomer(mobile: string) {
  const [customer] = await db.insert(customers).values({ mobile }).returning();
  return customer!;
}

/** Gives a customer a real paid order line for a variety, qualifying them to review it. */
async function givePaidPurchase(customerId: string, varietyId: string) {
  const [lot] = await db
    .insert(lots)
    .values({
      varietyId,
      code: `REV-${randomUUID().slice(0, 8)}`,
      originProvince: "گیلان",
      originCity: "تالش",
      harvestYear: 1405,
      grade: "momtaz",
      pricePerKgRial: fromToman(600_000),
      quantityOnHandG: kg(90),
      status: "active",
    })
    .returning();
  const [order] = await db
    .insert(orders)
    .values({
      orderNumber: `IR-REV${randomUUID().slice(0, 4).toUpperCase()}`,
      customerId,
      shipRecipientName: "x",
      shipRecipientMobile: "09120000000",
      shipProvince: "گیلان",
      shipCity: "رشت",
      shipLine1: "x",
      status: "paid",
      subtotalRial: fromToman(6_000_000),
      shippingFeeRial: 0,
      totalRial: fromToman(6_000_000),
      totalWeightG: kg(10),
      paidAt: new Date(),
    })
    .returning();
  await db.insert(orderLines).values({
    orderId: order!.id,
    varietyId,
    lotId: lot!.id,
    packSizeG: 10_000,
    packs: 1,
    unitPriceRial: fromToman(6_000_000),
    lineTotalRial: fromToman(6_000_000),
    lineWeightG: kg(10),
  });
}

describe("canReview()", () => {
  it("is false for a customer who never bought the variety", async () => {
    const variety = await seedVariety();
    const customer = await seedCustomer("09120000060");
    expect(await canReview(customer.id, variety.id)).toBe(false);
  });

  it("is true after a real paid purchase", async () => {
    const variety = await seedVariety();
    const customer = await seedCustomer("09120000061");
    await givePaidPurchase(customer.id, variety.id);
    expect(await canReview(customer.id, variety.id)).toBe(true);
  });

  it("is false again once they've already reviewed it", async () => {
    const variety = await seedVariety();
    const customer = await seedCustomer("09120000062");
    await givePaidPurchase(customer.id, variety.id);
    await submitReview({ customerId: customer.id, varietyId: variety.id, rating: 5, comment: "عالی بود" });
    expect(await canReview(customer.id, variety.id)).toBe(false);
  });
});

describe("submitReview()", () => {
  it("refuses a review from a customer who never bought the variety", async () => {
    const variety = await seedVariety();
    const customer = await seedCustomer("09120000063");
    await expect(
      submitReview({ customerId: customer.id, varietyId: variety.id, rating: 5, comment: "دروغ" }),
    ).rejects.toThrow(DomainError);
  });

  it("refuses an out-of-range rating", async () => {
    const variety = await seedVariety();
    const customer = await seedCustomer("09120000064");
    await givePaidPurchase(customer.id, variety.id);
    await expect(
      submitReview({ customerId: customer.id, varietyId: variety.id, rating: 6, comment: "x" }),
    ).rejects.toThrow(DomainError);
  });

  it("refuses a second review of the same variety by the same customer", async () => {
    const variety = await seedVariety();
    const customer = await seedCustomer("09120000065");
    await givePaidPurchase(customer.id, variety.id);
    await submitReview({ customerId: customer.id, varietyId: variety.id, rating: 4, comment: "خوب بود" });
    await expect(
      submitReview({ customerId: customer.id, varietyId: variety.id, rating: 5, comment: "دوباره" }),
    ).rejects.toThrow(DomainError);
  });
});

describe("getVarietyReviewSummary() / listVarietyReviews()", () => {
  it("averages ratings across multiple verified reviewers", async () => {
    const variety = await seedVariety();
    const a = await seedCustomer("09120000066");
    const b = await seedCustomer("09120000067");
    await givePaidPurchase(a.id, variety.id);
    await givePaidPurchase(b.id, variety.id);
    await submitReview({ customerId: a.id, varietyId: variety.id, rating: 5, comment: "عالی" });
    await submitReview({ customerId: b.id, varietyId: variety.id, rating: 3, comment: "معمولی" });

    const summary = await getVarietyReviewSummary(variety.id);
    expect(summary.reviewCount).toBe(2);
    expect(summary.averageRating).toBe(4);

    const list = await listVarietyReviews(variety.id);
    expect(list).toHaveLength(2);
  });

  it("reports no reviews honestly rather than a fake average", async () => {
    const variety = await seedVariety();
    const summary = await getVarietyReviewSummary(variety.id);
    expect(summary).toEqual({ averageRating: null, reviewCount: 0 });
  });
});
