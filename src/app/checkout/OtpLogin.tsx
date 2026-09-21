"use client";

/**
 * Two-step phone login, inline on the checkout page.
 *
 * Calling a "use server" action directly from a client component (rather
 * than only via a <form action>) is how the phone -> code step transition is
 * driven without a full page navigation between them; `router.refresh()`
 * after a successful verify re-runs the checkout page's Server Component so
 * it picks up the now-set session cookie.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestOtpAction, verifyOtpAction } from "../_actions/identity-actions";

/** Dev/staging convenience only — see /api/dev/last-otp; a 404 (ALLOW_DEV_OTP_PEEK unset) is silent here. */
async function peekDevCode(mobile: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/dev/last-otp?mobile=${encodeURIComponent(mobile)}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { code?: string };
    return body.code ?? null;
  } catch {
    return null;
  }
}

export function OtpLogin({ isDev }: { isDev: boolean }) {
  // `isDev` is really "the peek endpoint might work" — the fetch 404s harmlessly when it doesn't.
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [mobile, setMobile] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submitPhone(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await requestOtpAction(mobile);
      if (!result.ok) {
        setError(result.error ?? "خطایی رخ داد.");
        return;
      }
      setStep("code");
      if (isDev) {
        const devCode = await peekDevCode(mobile);
        if (devCode) setCode(devCode);
      }
    });
  }

  function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await verifyOtpAction(mobile, code);
      if (!result.ok) {
        setError(result.error ?? "کد نامعتبر است.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-5">
      <h2 className="mb-4 font-semibold">ورود با شماره موبایل</h2>

      {step === "phone" ? (
        <form onSubmit={submitPhone} className="flex flex-col gap-3">
          <input
            type="tel"
            inputMode="numeric"
            placeholder="۰۹۱۲۳۴۵۶۷۸۹"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            className="ltr-run rounded-md border border-line bg-surface-sunken px-3 py-2 text-left"
            dir="ltr"
            required
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-brand px-4 py-2 font-semibold text-white transition hover:bg-brand-strong disabled:opacity-60"
          >
            {pending ? "در حال ارسال…" : "ارسال کد"}
          </button>
        </form>
      ) : (
        <form onSubmit={submitCode} className="flex flex-col gap-3">
          <p className="text-sm text-muted">کد ۵ رقمی ارسال‌شده به {mobile} را وارد کنید.</p>
          <input
            type="text"
            inputMode="numeric"
            maxLength={5}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="ltr-run rounded-md border border-line bg-surface-sunken px-3 py-2 text-center text-lg tracking-widest"
            dir="ltr"
            required
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-brand px-4 py-2 font-semibold text-white transition hover:bg-brand-strong disabled:opacity-60"
          >
            {pending ? "در حال بررسی…" : "ورود"}
          </button>
          <button type="button" onClick={() => setStep("phone")} className="text-sm text-muted hover:underline">
            تغییر شماره
          </button>
        </form>
      )}

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </div>
  );
}
