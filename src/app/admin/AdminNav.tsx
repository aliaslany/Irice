/**
 * The whole admin surface's nav — three links and a logout button. There is
 * no admin layout/shell beyond this because there is no admin product here,
 * just the operator worklist the return flow and certificate feature need.
 * See modules/admin/auth.ts for why this stays this small.
 */
import { adminLogoutAction } from "../_actions/admin-actions";

export function AdminNav({ active }: { active: "returns" | "certificates" | "orders" }) {
  const links: { href: string; key: typeof active; label: string }[] = [
    { href: "/admin/returns", key: "returns", label: "مرجوعی‌ها" },
    { href: "/admin/certificates", key: "certificates", label: "گواهی‌ها" },
    { href: "/admin/orders", key: "orders", label: "سفارش‌ها" },
  ];

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
      <nav className="flex gap-4 text-sm">
        {links.map((link) => (
          <a
            key={link.key}
            href={link.href}
            className={link.key === active ? "font-semibold text-brand-strong" : "text-muted hover:text-ink"}
          >
            {link.label}
          </a>
        ))}
      </nav>
      <form action={adminLogoutAction}>
        <button type="submit" className="text-sm text-muted hover:text-danger">
          خروج
        </button>
      </form>
    </div>
  );
}
