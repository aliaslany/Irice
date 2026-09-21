"use client";

import { useState } from "react";
import { approveReturnAction, rejectReturnAction } from "../../_actions/admin-actions";

export function ReturnRequestRow({ returnRequestId }: { returnRequestId: string }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);

  async function handleApprove() {
    setError(null);
    setPending("approve");
    const formData = new FormData();
    formData.set("returnRequestId", returnRequestId);
    formData.set("resolutionNote", note);
    const result = await approveReturnAction(formData);
    setPending(null);
    if (!result.ok) setError(result.error ?? "خطایی رخ داد.");
  }

  async function handleReject() {
    if (note.trim().length === 0) {
      setError("برای رد درخواست باید توضیحی برای مشتری بنویسید.");
      return;
    }
    setError(null);
    setPending("reject");
    const formData = new FormData();
    formData.set("returnRequestId", returnRequestId);
    formData.set("resolutionNote", note);
    const result = await rejectReturnAction(formData);
    setPending(null);
    if (!result.ok) setError(result.error ?? "خطایی رخ داد.");
  }

  return (
    <div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="یادداشت برای مشتری (برای رد، الزامی است)"
        className="mb-2 w-full rounded-md border border-line bg-surface-sunken px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleApprove}
          disabled={pending !== null}
          className="rounded-md bg-success px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending === "approve" ? "در حال تأیید…" : "تأیید و بازگرداندن وجه"}
        </button>
        <button
          type="button"
          onClick={handleReject}
          disabled={pending !== null}
          className="rounded-md border border-danger px-4 py-2 text-sm text-danger disabled:opacity-60"
        >
          {pending === "reject" ? "در حال رد…" : "رد درخواست"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
