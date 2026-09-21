import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { formatJalali } from "../../../globals/date";
import { listLotsForAdmin, listRecentCertificates } from "../../../modules/admin/operations";
import { getIsAdmin } from "../../lib/admin";
import { AdminNav } from "../AdminNav";
import { CertificateUploadForm } from "./CertificateUploadForm";

export const metadata: Metadata = { title: "گواهی‌ها | مدیریت", robots: { index: false, follow: false } };

const CERT_LABEL_FA: Record<string, string> = {
  lab_analysis: "آزمون آزمایشگاهی",
  origin: "گواهی خاستگاه",
  organic: "گواهی ارگانیک",
  health: "گواهی بهداشت",
};

export default async function AdminCertificatesPage() {
  if (!(await getIsAdmin())) redirect("/admin/login");

  const [lots, recentCertificates] = await Promise.all([listLotsForAdmin(), listRecentCertificates()]);

  return (
    <div className="mx-auto max-w-3xl">
      <AdminNav active="certificates" />
      <h1 className="mb-6 text-xl font-bold">افزودن گواهی به محموله</h1>

      <div className="mb-8">
        <CertificateUploadForm lots={lots} />
      </div>

      <h2 className="mb-3 font-semibold">گواهی‌های اخیر</h2>
      {recentCertificates.length === 0 ? (
        <p className="text-muted">هنوز گواهی‌ای ثبت نشده است.</p>
      ) : (
        <ul className="space-y-2">
          {recentCertificates.map(({ certificate, lotCode }) => (
            <li
              key={certificate.id}
              className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2"
            >
              <span>
                <span className="ltr-run font-medium">{lotCode}</span> —{" "}
                {CERT_LABEL_FA[certificate.kind] ?? certificate.kind} ({certificate.issuer})
              </span>
              <span className="text-xs text-muted">{formatJalali(certificate.issuedAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
