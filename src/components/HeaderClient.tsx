"use client";

/**
 * The personalised half of the header: cart count and login/account link.
 * Client-fetched from /api/cart-summary so the page shell around it (and
 * every route sharing this layout) can stay statically rendered — see the
 * comment on that route for why cookies() can never be read in the layout
 * itself.
 *
 * Refetches on every route change, which covers the realistic flow (add an
 * item, then navigate to the cart or checkout); an add-to-cart click that
 * stays on the same product page won't bump the badge until the next
 * navigation. A documented trade-off, not an oversight.
 */
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

interface CartSummary {
  itemCount: number;
  isLoggedIn: boolean;
}

export function HeaderClient() {
  const pathname = usePathname();
  const [summary, setSummary] = useState<CartSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/cart-summary")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: CartSummary | null) => {
        if (!cancelled && data) setSummary(data);
      })
      .catch(() => {
        /* silently keep the previous state — this is a convenience badge, not critical UI */
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <div className="flex items-center gap-4 text-sm">
      <a href={summary?.isLoggedIn ? "/account" : "/checkout"} className="text-brand hover:underline">
        {summary?.isLoggedIn ? "🎫 پاسپورت من" : "ورود"}
      </a>
      <a href="/cart" className="flex items-center gap-1 text-brand hover:underline">
        🛒 سبد خرید
        {summary && summary.itemCount > 0 && (
          <span className="tabular rounded-full bg-brand px-2 py-0.5 text-xs text-white">
            {summary.itemCount.toLocaleString("fa-IR")}
          </span>
        )}
      </a>
    </div>
  );
}
