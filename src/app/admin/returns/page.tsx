import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { formatJalali } from "../../../globals/date";
import { Price } from "../../../components/primitives";
import { listOpenReturnRequests } from "../../../modules/returns/returns";
import { getIsAdmin } from "../../lib/admin";
import { AdminNav } from "../AdminNav";
import { ReturnRequestRow } from "./ReturnRequestRow";

export const metadata: Metadata = { title: "مرجوعی‌ها | مدیریت", robots: { index: false, follow: false } };

export default async function AdminReturnsPage() {
  if (!(await getIsAdmin())) redirect("/admin/login");

  const requests = await listOpenReturnRequests();

  return (
    <div className="mx-auto max-w-3xl">
      <AdminNav active="returns" />
      <h1 className="mb-6 text-xl font-bold">درخواست‌های مرجوعی در انتظار بررسی</h1>

      {requests.length === 0 ? (
        <p className="text-muted">در حال حاضر درخواستی برای بررسی وجود ندارد.</p>
      ) : (
        <ul className="space-y-4">
          {requests.map(({ request, order }) => (
            <li key={request.id} className="rounded-lg border border-line bg-surface p-5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="ltr-run font-semibold">{order.orderNumber}</span>
                <span className="text-xs text-muted">{formatJalali(request.requestedAt)}</span>
              </div>
              <p className="mb-1 text-sm">
                مبلغ سفارش: <Price amountRial={order.totalRial} />
              </p>
              <p className="mb-3 text-sm text-muted">دلیل: {request.reason}</p>
              <ReturnRequestRow returnRequestId={request.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
