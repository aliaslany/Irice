import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/client";
import { addresses, customers, lotCertificates, lots, orders, varieties } from "../../db/schema/index";
import { DomainError } from "../../globals/errors";
import { fromToman } from "../../globals/money";
import { kg } from "../../globals/weight";
import { attachCertificateToLot, listOrdersAwaitingFulfillment, markOrderFulfilled } from "./operations";

async function resetDb(): Promise<void> {
  await db.execute(
    `truncate table lot_certificates, orders, addresses, customers, lots, varieties restart identity cascade`,
  );
}

beforeEach(resetDb);
afterAll(resetDb);

async function seedLot() {
  const [variety] = await db
    .insert(varieties)
    .values({ slug: "verify-admin", nameFa: "برنج آزمایشی", grainType: "long", isPublished: true })
    .returning();
  const [lot] = await db
    .insert(lots)
    .values({
      varietyId: variety!.id,
      code: `ADM-${randomUUID().slice(0, 8)}`,
      originProvince: "گیلان",
      originCity: "تالش",
      harvestYear: 1405,
      grade: "momtaz",
      pricePerKgRial: fromToman(600_000),
      quantityOnHandG: kg(100),
      status: "active",
    })
    .returning();
  return lot!;
}

async function seedPaidOrder() {
  const [customer] = await db.insert(customers).values({ mobile: "09120000070" }).returning();
  const [address] = await db
    .insert(addresses)
    .values({
      customerId: customer!.id,
      recipientName: "x",
      recipientMobile: "09120000070",
      province: "گیلان",
      city: "رشت",
      line1: "x",
    })
    .returning();
  const [order] = await db
    .insert(orders)
    .values({
      orderNumber: `IR-ADM${randomUUID().slice(0, 4).toUpperCase()}`,
      customerId: customer!.id,
      addressId: address!.id,
      shipRecipientName: "x",
      shipRecipientMobile: "09120000070",
      shipProvince: "گیلان",
      shipCity: "رشت",
      shipLine1: "x",
      status: "paid",
      subtotalRial: fromToman(1_000_000),
      shippingFeeRial: 0,
      totalRial: fromToman(1_000_000),
      totalWeightG: kg(5),
      paidAt: new Date(),
    })
    .returning();
  return order!;
}

describe("attachCertificateToLot()", () => {
  it("attaches a certificate by lot code", async () => {
    const lot = await seedLot();
    const cert = await attachCertificateToLot({
      lotCode: lot.code,
      kind: "lab_analysis",
      issuer: "آزمایشگاه کنترل کیفیت",
      referenceNo: "REF-1",
      issuedAt: new Date(),
      fileUrl: "/uploads/certificates/test.pdf",
    });
    const rows = await db.select().from(lotCertificates).where(eq(lotCertificates.lotId, lot.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(cert.id);
  });

  it("refuses an unknown lot code", async () => {
    await expect(
      attachCertificateToLot({
        lotCode: "NO-SUCH-LOT",
        kind: "lab_analysis",
        issuer: "x",
        issuedAt: new Date(),
        fileUrl: "/uploads/certificates/test.pdf",
      }),
    ).rejects.toThrow(DomainError);
  });
});

describe("markOrderFulfilled()", () => {
  it("transitions a paid order to fulfilled and stamps fulfilledAt", async () => {
    const order = await seedPaidOrder();
    await markOrderFulfilled(order.id);
    const [after] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(after?.status).toBe("fulfilled");
    expect(after?.fulfilledAt).not.toBeNull();
  });

  it("refuses to fulfil an order that isn't paid", async () => {
    const order = await seedPaidOrder();
    await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, order.id));
    await expect(markOrderFulfilled(order.id)).rejects.toThrow(DomainError);
  });

  it("no longer appears in the awaiting-fulfillment worklist once fulfilled", async () => {
    const order = await seedPaidOrder();
    expect((await listOrdersAwaitingFulfillment()).map((o) => o.id)).toContain(order.id);
    await markOrderFulfilled(order.id);
    expect((await listOrdersAwaitingFulfillment()).map((o) => o.id)).not.toContain(order.id);
  });
});
