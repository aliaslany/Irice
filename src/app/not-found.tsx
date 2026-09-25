import type { Metadata } from "next";

export const metadata: Metadata = { title: "صفحه پیدا نشد", robots: { index: false } };

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold">این صفحه پیدا نشد</h1>
      <p className="mt-3 text-muted">
        اگر کد محموله را از روی کیسه وارد کرده‌اید، ممکن است اشتباه تایپ شده باشد.
      </p>
      <a href="/" className="mt-6 inline-block text-brand hover:underline">
        بازگشت به فهرست برنج‌ها
      </a>
    </div>
  );
}
