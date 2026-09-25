import type { Metadata, Viewport } from "next";
import { EnamadBadge } from "../components/EnamadBadge";
import { HeaderClient } from "../components/HeaderClient";
import { DEFAULT_LOCALE } from "../globals/i18n";
import { htmlAttributes } from "../globals/rtl";
import { OPEN_GRAPH_BASE, SITE_NAME_FA, SITE_TAGLINE_FA } from "../modules/seo/structured-data";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "https://irice.ir"),
  title: {
    default: `${SITE_NAME_FA} | ${SITE_TAGLINE_FA}`,
    template: `%s | ${SITE_NAME_FA}`,
  },
  description:
    "برنج ایرانی درجه یک، مستقیم از شالیزار و کارخانه. هر کیسه با شناسنامه محموله: خاستگاه، سال برداشت و گواهی آزمایشگاهی.",
  applicationName: SITE_NAME_FA,
  keywords: ["برنج ایرانی", "خرید برنج", "خرید آنلاین برنج", "برنج شمال", "برنج مستقیم از کارخانه", "شناسنامه محموله"],
  openGraph: OPEN_GRAPH_BASE,
  twitter: { card: "summary" },
  // Long runs of Persian digits (prices, lot codes, mobile numbers) get
  // auto-linked as phone numbers by mobile Safari otherwise.
  formatDetection: { telephone: false, email: false, address: false },
  robots: { index: true, follow: true },
};

/** Browser chrome matches the page background — the same values as --color-bg in both themes. */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#14130f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html {...htmlAttributes(DEFAULT_LOCALE)}>
      <body className="bg-bg text-ink">
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
            <a href="/" className="text-xl font-bold text-brand-strong">
              آیرایس
            </a>
            <p className="hidden text-sm text-muted sm:block">مستقیم از کارخانه، بدون واسطه</p>
            <HeaderClient />
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>

        <footer className="mt-16 border-t border-line bg-surface">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-6 px-4 py-8">
            <div className="text-sm text-muted">
              <p>ضمانت بازگشت کالا تا ۱۰ روز پس از تحویل.</p>
              <p className="mt-2">
                روی هر کیسه یک کد محموله چاپ شده است؛ با آن می‌توانید خاستگاه، سال برداشت و گواهی
                آزمایشگاهی همان محموله را ببینید.
              </p>
            </div>
            <EnamadBadge />
          </div>
        </footer>
      </body>
    </html>
  );
}
