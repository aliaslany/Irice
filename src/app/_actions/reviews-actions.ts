"use server";

import { revalidatePath } from "next/cache";
import { DomainError } from "../../globals/errors";
import { submitReview } from "../../modules/reviews/reviews";
import { getCurrentCustomer } from "../lib/session";
import type { ActionResult } from "./identity-actions";

export async function submitReviewAction(formData: FormData): Promise<ActionResult> {
  const customer = await getCurrentCustomer();
  if (!customer) return { ok: false, error: "برای ثبت نظر ابتدا وارد شوید." };

  const varietyId = String(formData.get("varietyId") ?? "");
  const varietySlug = String(formData.get("varietySlug") ?? "");
  const rating = Number(formData.get("rating") ?? 0);
  const comment = String(formData.get("comment") ?? "");
  if (!varietyId) return { ok: false, error: "محصول نامعتبر است." };

  try {
    await submitReview({ customerId: customer.id, varietyId, rating, comment });
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.messageFa };
    throw error;
  }

  if (varietySlug) revalidatePath(`/rice/${varietySlug}`);
  return { ok: true };
}
