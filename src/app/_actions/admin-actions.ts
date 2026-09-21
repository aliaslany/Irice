"use server";

/**
 * Every action here guards itself with `getIsAdmin()` before touching
 * anything, even though every admin page already redirects an unauthenticated
 * visitor away — a Server Action is a public HTTP endpoint in its own right
 * (reachable by its action id regardless of which page rendered the form
 * that pointed at it), so the page-level redirect alone is not a real gate.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loadEnv } from "../../globals/config";
import { DomainError } from "../../globals/errors";
import { isValidAdminToken } from "../../modules/admin/auth";
import { attachCertificateToLot, markOrderFulfilled } from "../../modules/admin/operations";
import { CertificateUploadError, saveCertificateFile } from "../../modules/certificates/storage";
import { approveReturn, rejectReturn } from "../../modules/returns/returns";
import { clearAdminCookie, getIsAdmin, setAdminCookie } from "../lib/admin";
import type { ActionResult } from "./identity-actions";

export async function adminLoginAction(formData: FormData): Promise<ActionResult> {
  const token = String(formData.get("token") ?? "");
  const env = loadEnv();
  if (!token || !isValidAdminToken(token, env.ADMIN_TOKEN)) {
    return { ok: false, error: "توکن نامعتبر است." };
  }
  await setAdminCookie();
  redirect("/admin/returns");
}

export async function adminLogoutAction(): Promise<void> {
  await clearAdminCookie();
  redirect("/admin/login");
}

export async function approveReturnAction(formData: FormData): Promise<ActionResult> {
  if (!(await getIsAdmin())) return { ok: false, error: "دسترسی مجاز نیست." };

  const returnRequestId = String(formData.get("returnRequestId") ?? "");
  const resolutionNote = String(formData.get("resolutionNote") ?? "");
  if (!returnRequestId) return { ok: false, error: "درخواست نامعتبر است." };

  try {
    await approveReturn(returnRequestId, resolutionNote || undefined);
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.messageFa };
    throw error;
  }
  revalidatePath("/admin/returns");
  return { ok: true };
}

export async function rejectReturnAction(formData: FormData): Promise<ActionResult> {
  if (!(await getIsAdmin())) return { ok: false, error: "دسترسی مجاز نیست." };

  const returnRequestId = String(formData.get("returnRequestId") ?? "");
  const resolutionNote = String(formData.get("resolutionNote") ?? "");
  if (!returnRequestId) return { ok: false, error: "درخواست نامعتبر است." };

  try {
    await rejectReturn(returnRequestId, resolutionNote);
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.messageFa };
    throw error;
  }
  revalidatePath("/admin/returns");
  return { ok: true };
}

export async function markFulfilledAction(formData: FormData): Promise<ActionResult> {
  if (!(await getIsAdmin())) return { ok: false, error: "دسترسی مجاز نیست." };

  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return { ok: false, error: "سفارش نامعتبر است." };

  try {
    await markOrderFulfilled(orderId);
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.messageFa };
    throw error;
  }
  revalidatePath("/admin/orders");
  return { ok: true };
}

const CERTIFICATE_KINDS = ["lab_analysis", "origin", "organic", "health"] as const;

export async function attachCertificateAction(formData: FormData): Promise<ActionResult> {
  if (!(await getIsAdmin())) return { ok: false, error: "دسترسی مجاز نیست." };

  const lotCode = String(formData.get("lotCode") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "");
  const issuer = String(formData.get("issuer") ?? "").trim();
  const referenceNo = String(formData.get("referenceNo") ?? "").trim();
  const issuedAtRaw = String(formData.get("issuedAt") ?? "");
  const file = formData.get("file");

  if (!lotCode || !issuer || !issuedAtRaw) return { ok: false, error: "همه فیلدهای الزامی را پر کنید." };
  if (!CERTIFICATE_KINDS.includes(kindRaw as (typeof CERTIFICATE_KINDS)[number])) {
    return { ok: false, error: "نوع گواهی نامعتبر است." };
  }
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "فایل گواهی را انتخاب کنید." };

  const issuedAt = new Date(issuedAtRaw);
  if (Number.isNaN(issuedAt.getTime())) return { ok: false, error: "تاریخ صدور نامعتبر است." };

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let fileUrl: string;
    try {
      fileUrl = await saveCertificateFile(bytes, file.name);
    } catch (error) {
      if (error instanceof CertificateUploadError) return { ok: false, error: error.message };
      throw error;
    }

    await attachCertificateToLot({
      lotCode,
      kind: kindRaw as (typeof CERTIFICATE_KINDS)[number],
      issuer,
      ...(referenceNo ? { referenceNo } : {}),
      issuedAt,
      fileUrl,
    });
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.messageFa };
    throw error;
  }
  revalidatePath("/admin/certificates");
  return { ok: true };
}
