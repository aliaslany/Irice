"use client";

import { useState } from "react";
import { requestReturnAction } from "../../_actions/returns-actions";

export function ReturnRequestForm({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setError(null);
    const result = await requestReturnAction(formData);
    // A successful call redirects server-side and never returns here; only a
    // handled DomainError produces a result object to show inline.
    if (result && !result.ok) setError(result.error ?? "خطایی رخ داد.");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-md border border-line px-4 py-2 text-sm font-medium hover:bg-surface-sunken"
      >
        درخواست مرجوعی
      </button>
    );
  }

  return (
    <form action={handleSubmit} className="rounded-lg border border-line bg-surface p-4">
      <input type="hidden" name="orderId" value={orderId} />
      <label htmlFor="return-reason" className="mb-2 block text-sm font-medium">
        دلیل درخواست مرجوعی
      </label>
      <textarea
        id="return-reason"
        name="reason"
        required
        rows={3}
        className="w-full rounded-md border border-line bg-surface-sunken px-3 py-2 text-sm"
        placeholder="مثلاً: کیفیت برنج مطابق انتظار نبود، بسته آسیب دیده بود…"
      />
      <div className="mt-3 flex gap-2">
        <button type="submit" className="flex-1 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">
          ثبت درخواست
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-line px-4 py-2 text-sm text-muted"
        >
          انصراف
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </form>
  );
}
