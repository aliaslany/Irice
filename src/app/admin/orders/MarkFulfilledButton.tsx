"use client";

import { useState } from "react";
import { markFulfilledAction } from "../../_actions/admin-actions";

export function MarkFulfilledButton({ orderId }: { orderId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    const formData = new FormData();
    formData.set("orderId", orderId);
    const result = await markFulfilledAction(formData);
    setPending(false);
    if (!result.ok) setError(result.error ?? "خطایی رخ داد.");
  }

  return (
    <div className="text-left">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "در حال ثبت…" : "ارسال شد"}
      </button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
