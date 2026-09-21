/**
 * Verified-purchase reviews.
 *
 * The verification is server-side and non-negotiable: a customer may review
 * a variety only after a PAID order of theirs actually contains it. The
 * client never gets to assert "I bought this" — every check here re-derives
 * it from order_lines, the same source of truth the Rice Passport's variety
 * stamps use.
 */
import { and, avg, count, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "../../db/client";
import { customers, orderLines, orders, reviews, type Review } from "../../db/schema/index";
import { DomainError, isPostgresUniqueViolation } from "../../globals/errors";

/** The most recent paid order of this customer's that actually contains the variety — the review's anchor. */
async function findQualifyingOrder(customerId: string, varietyId: string): Promise<string | null> {
  const [row] = await db
    .select({ orderId: orders.id })
    .from(orderLines)
    .innerJoin(orders, eq(orderLines.orderId, orders.id))
    .where(
      and(eq(orderLines.varietyId, varietyId), eq(orders.customerId, customerId), isNotNull(orders.paidAt)),
    )
    .orderBy(desc(orders.paidAt))
    .limit(1);
  return row?.orderId ?? null;
}

export async function canReview(customerId: string, varietyId: string): Promise<boolean> {
  const [existing] = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(and(eq(reviews.customerId, customerId), eq(reviews.varietyId, varietyId)));
  if (existing) return false;
  return (await findQualifyingOrder(customerId, varietyId)) !== null;
}

export async function submitReview(params: {
  customerId: string;
  varietyId: string;
  rating: number;
  comment: string;
}): Promise<Review> {
  if (!Number.isInteger(params.rating) || params.rating < 1 || params.rating > 5) {
    throw new DomainError("VALIDATION", "rating must be an integer from 1 to 5", { rating: params.rating });
  }

  const orderId = await findQualifyingOrder(params.customerId, params.varietyId);
  if (!orderId) {
    throw new DomainError(
      "FORBIDDEN",
      "only a customer with a paid order containing this variety may review it",
      { varietyId: params.varietyId },
    );
  }

  try {
    const [created] = await db
      .insert(reviews)
      .values({
        customerId: params.customerId,
        varietyId: params.varietyId,
        orderId,
        rating: params.rating,
        comment: params.comment.trim() || null,
      })
      .returning();
    if (!created) throw new Error("failed to create review");
    return created;
  } catch (error) {
    if (isPostgresUniqueViolation(error)) {
      throw new DomainError("CONFLICT", "you have already reviewed this variety", {
        varietyId: params.varietyId,
      });
    }
    throw error;
  }
}

export interface VarietyReviewSummary {
  averageRating: number | null;
  reviewCount: number;
}

export async function getVarietyReviewSummary(varietyId: string): Promise<VarietyReviewSummary> {
  const [row] = await db
    .select({ averageRating: avg(reviews.rating), reviewCount: count(reviews.id) })
    .from(reviews)
    .where(and(eq(reviews.varietyId, varietyId), eq(reviews.isPublished, true)));
  return {
    averageRating: row?.averageRating ? Number(row.averageRating) : null,
    reviewCount: Number(row?.reviewCount ?? 0),
  };
}

export interface DisplayReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  /** Never the customer's mobile number — a chosen display name, or the anonymous fallback. */
  reviewerName: string;
}

const ANONYMOUS_REVIEWER_FA = "خریدار تأییدشده";

export async function listVarietyReviews(varietyId: string): Promise<DisplayReview[]> {
  const rows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      comment: reviews.comment,
      createdAt: reviews.createdAt,
      displayName: customers.displayName,
    })
    .from(reviews)
    .innerJoin(customers, eq(reviews.customerId, customers.id))
    .where(and(eq(reviews.varietyId, varietyId), eq(reviews.isPublished, true)))
    .orderBy(desc(reviews.createdAt));

  return rows.map((row) => ({
    id: row.id,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.createdAt,
    reviewerName: row.displayName?.trim() || ANONYMOUS_REVIEWER_FA,
  }));
}
