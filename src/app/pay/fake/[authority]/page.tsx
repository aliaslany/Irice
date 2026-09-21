import type { Metadata } from "next";

export const metadata: Metadata = { title: "شبیه‌ساز درگاه پرداخت", robots: { index: false } };

interface PageProps {
  params: Promise<{ authority: string }>;
}

/**
 * Stands in for a real bank payment page. Only reachable when
 * ZARINPAL_MERCHANT_ID isn't configured (see modules/payments — the fake
 * provider is what generates this URL in the first place), so it never
 * exists as a live route once a real merchant account is wired up.
 *
 * The buttons are plain links to a GET route (./confirm), not a form posting
 * to a Server Action — see that route's comment for why: a POST-triggered
 * same-app redirect chain hit a real Chromium SameSite=Lax cookie-dropping
 * edge case that a plain GET redirect, matching how a real gateway actually
 * sends the browser back, does not.
 */
export default async function FakeGatewayPage({ params }: PageProps) {
  const { authority } = await params;

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-lg border-2 border-dashed border-accent bg-surface p-6">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">
          شبیه‌ساز درگاه پرداخت (محیط توسعه)
        </p>
        <h1 className="mb-4 text-xl font-bold">این یک درگاه واقعی نیست</h1>
        <p className="mb-1 text-sm text-muted">کد پیگیری تراکنش</p>
        <p className="ltr-run mb-6 rounded-sm bg-surface-sunken px-2 py-1 text-sm">{authority}</p>

        <div className="flex flex-col gap-3">
          <a
            href={`/pay/fake/${authority}/confirm?outcome=success`}
            className="block w-full rounded-md bg-success px-4 py-3 text-center font-semibold text-white transition hover:opacity-90"
          >
            پرداخت موفق ✅
          </a>
          <a
            href={`/pay/fake/${authority}/confirm?outcome=failure`}
            className="block w-full rounded-md border border-danger px-4 py-3 text-center font-semibold text-danger transition hover:bg-danger/10"
          >
            پرداخت ناموفق ❌
          </a>
        </div>
      </div>
    </div>
  );
}
