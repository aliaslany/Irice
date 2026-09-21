"use server";

import { redirect } from "next/navigation";
import { DomainError } from "../../globals/errors";
import { requestReturn } from "../../modules/returns/returns";
import { getCurrentCustomer } from "../lib/session";
import type { ActionResult } from "./identity-actions";

export async function requestReturnAction(formData: FormData): Promise<ActionResult> {
  const customer = await getCurrentCustomer();
  if (!customer) return { ok: false, error: "برای درخواست مرجوعی ابتدا وارد شوید." };

  const orderId = String(formData.get("orderId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  if (!orderId) return { ok: false, error: "سفارش نامعتبر است." };

  try {
    await requestReturn({ orderId, customerId: customer.id, reason });
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.messageFa };
    throw error;
  }

  redirect(`/orders/${orderId}`);
}
