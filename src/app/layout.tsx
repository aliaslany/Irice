import type { Metadata } from "next";
import { EnamadBadge } from "../components/EnamadBadge";
import { HeaderClient } from "../components/HeaderClient";
import { DEFAULT_LOCALE } from "../globals/i18n";
import { htmlAttributes } from "../globals/rtl";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "https://irice.ir"),
  title: {
    default: "آیرایس | برنج ایرانی مستقیم از کارخانه",
    template: "%s | آیرایس",
  },
  description:
    "برنج ایرانی درجه یک، مستقیم از شالیزار و کارخانه. هر کیسه با شناسنامه محموله: خاستگاه، سال برداشت و گواهی آزمایشگاهی.",
  openGraph: { type: "website", locale: "fa_IR", siteName: "آیرایس" },
  robots: { index: true, follow: true },
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
