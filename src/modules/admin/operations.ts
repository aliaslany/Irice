/**
 * The handful of writes an operator can make through the admin surface —
 * attaching a lab certificate, marking an order fulfilled. Deliberately
 * small: this is not an admin product, it's the minimum real functionality
 * the return flow and the certificate-display feature actually need an
 * operator to do. See modules/admin/auth.ts for the auth model this sits
 * behind.
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client";
import { lotCertificates, lots, orders, varieties, type LotCertificate } from "../../db/schema/index";
import { DomainError } from "../../globals/errors";
import { nextOrderStatus } from "../orders/lifecycle";

export interface AttachCertificateInput {
  lotCode: string;
  kind: "lab_analysis" | "origin" | "organic" | "health";
  issuer: string;
  referenceNo?: string;
  issuedAt: Date;
  fileUrl: string;
}

export async function attachCertificateToLot(input: AttachCertificateInput): Promise<LotCertificate> {
  const [lot] = await db.select({ id: lots.id }).from(lots).where(eq(lots.code, input.lotCode));
  if (!lot) throw new DomainError("NOT_FOUND", "no lot with this code", { lotCode: input.lotCode });

  const [created] = await db
    .insert(lotCertificates)
    .values({
      lotId: lot.id,
      kind: input.kind,
      issuer: input.issuer,
      referenceNo: input.referenceNo,
      issuedAt: input.issuedAt,
      fileUrl: input.fileUrl,
      isPublic: true,
    })
    .returning();
  if (!created) throw new Error("failed to attach certificate");
  return created;
}

export async function markOrderFulfilled(orderId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order) throw new DomainError("NOT_FOUND", "order not found", { orderId });

    const nextStatus = nextOrderStatus(order.status as never, "fulfill");
    await tx
      .update(orders)
      .set({ status: nextStatus, fulfilledAt: new Date() })
      .where(eq(orders.id, orderId));
  });
}

/** Lot codes for the certificate-upload picker, newest first. */
export async function listLotsForAdmin(): Promise<{ code: string; varietyNameFa: string }[]> {
  const rows = await db
    .select({ code: lots.code, varietyNameFa: varieties.nameFa })
    .from(lots)
    .innerJoin(varieties, eq(lots.varietyId, varieties.id))
    .orderBy(desc(lots.createdAt));
  return rows;
}

/** Certificates attached so far, newest first — so the admin can see what's already on file. */
export async function listRecentCertificates(limit = 20) {
  return db
    .select({ certificate: lotCertificates, lotCode: lots.code })
    .from(lotCertificates)
    .innerJoin(lots, eq(lotCertificates.lotId, lots.id))
    .orderBy(desc(lotCertificates.createdAt))
    .limit(limit);
}

/** Paid orders not yet marked fulfilled — the admin worklist. */
export async function listOrdersAwaitingFulfillment() {
  return db
    .select()
    .from(orders)
    .where(and(eq(orders.status, "paid"), isNull(orders.fulfilledAt)))
    .orderBy(desc(orders.paidAt));
}
