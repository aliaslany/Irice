"use client";

import { useState } from "react";
import { attachCertificateAction } from "../../_actions/admin-actions";

const KIND_OPTIONS: { value: string; label: string }[] = [
  { value: "lab_analysis", label: "آزمون آزمایشگاهی" },
  { value: "origin", label: "گواهی خاستگاه" },
  { value: "organic", label: "گواهی ارگانیک" },
  { value: "health", label: "گواهی بهداشت" },
];

export function CertificateUploadForm({ lots }: { lots: { code: string; varietyNameFa: string }[] }) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    setPending(true);
    const result = await attachCertificateAction(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "خطایی رخ داد.");
      return;
    }
    setSuccess(true);
  }

  return (
    <form action={handleSubmit} className="grid grid-cols-1 gap-3 rounded-lg border border-line bg-surface p-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor="cert-lot" className="mb-1 block text-sm font-medium">
          کد محموله
        </label>
        <input
          id="cert-lot"
          name="lotCode"
          list="lot-codes"
          required
          className="ltr-run w-full rounded-md border border-line bg-surface-sunken px-3 py-2"
          dir="ltr"
        />
        <datalist id="lot-codes">
          {lots.map((lot) => (
            <option key={lot.code} value={lot.code}>
              {lot.varietyNameFa}
            </option>
          ))}
        </datalist>
      </div>

      <div>
        <label htmlFor="cert-kind" className="mb-1 block text-sm font-medium">
          نوع گواهی
        </label>
        <select id="cert-kind" name="kind" required className="w-full rounded-md border border-line bg-surface-sunken px-3 py-2">
          {KIND_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="cert-issuer" className="mb-1 block text-sm font-medium">
          صادرکننده
        </label>
        <input
          id="cert-issuer"
          name="issuer"
          required
          className="w-full rounded-md border border-line bg-surface-sunken px-3 py-2"
        />
      </div>

      <div>
        <label htmlFor="cert-reference" className="mb-1 block text-sm font-medium">
          شماره مرجع (اختیاری)
        </label>
        <input
          id="cert-reference"
          name="referenceNo"
          className="ltr-run w-full rounded-md border border-line bg-surface-sunken px-3 py-2"
          dir="ltr"
        />
      </div>

      <div>
        <label htmlFor="cert-issued-at" className="mb-1 block text-sm font-medium">
          تاریخ صدور
        </label>
        <input
          id="cert-issued-at"
          name="issuedAt"
          type="date"
          required
          className="ltr-run w-full rounded-md border border-line bg-surface-sunken px-3 py-2"
          dir="ltr"
        />
      </div>

      <div className="sm:col-span-2">
        <label htmlFor="cert-file" className="mb-1 block text-sm font-medium">
          فایل (PDF یا تصویر — حداکثر ۱۰ مگابایت)
        </label>
        <input
          id="cert-file"
          name="file"
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          required
          className="w-full rounded-md border border-line bg-surface-sunken px-3 py-2 text-sm"
        />
      </div>

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-4 py-2 font-semibold text-white disabled:opacity-60"
        >
          {pending ? "در حال بارگذاری…" : "افزودن گواهی"}
        </button>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        {success && <p className="mt-2 text-sm text-success">گواهی با موفقیت ثبت شد.</p>}
      </div>
    </form>
  );
}
