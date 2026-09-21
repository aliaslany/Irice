import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { formatJalali } from "../../../globals/date";
import { Price } from "../../../components/primitives";
import { listOrdersAwaitingFulfillment } from "../../../modules/admin/operations";
import { getIsAdmin } from "../../lib/admin";
import { AdminNav } from "../AdminNav";
import { MarkFulfilledButton } from "./MarkFulfilledButton";

export const metadata: Metadata = { title: "سفارش‌ها | مدیریت", robots: { index: false, follow: false } };

export default async function AdminOrdersPage() {
  if (!(await getIsAdmin())) redirect("/admin/login");

  const pendingOrders = await listOrdersAwaitingFulfillment();

  return (
    <div className="mx-auto max-w-3xl">
      <AdminNav active="orders" />
      <h1 className="mb-6 text-xl font-bold">سفارش‌های پرداخت‌شده در انتظار ارسال</h1>

      {pendingOrders.length === 0 ? (
        <p className="text-muted">سفارشی در انتظار ارسال نیست.</p>
      ) : (
        <ul className="space-y-3">
          {pendingOrders.map((order) => (
            <li
              key={order.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4"
            >
              <div>
                <p className="ltr-run font-semibold">{order.orderNumber}</p>
                <p className="text-sm text-muted">
                  {order.shipCity}، {order.shipProvince} — {order.paidAt ? formatJalali(order.paidAt) : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Price amountRial={order.totalRial} className="font-medium" />
                <MarkFulfilledButton orderId={order.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
