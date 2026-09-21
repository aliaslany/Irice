import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getIsAdmin } from "../../lib/admin";
import { AdminLoginForm } from "./AdminLoginForm";

export const metadata: Metadata = { title: "ورود مدیریت", robots: { index: false, follow: false } };

export default async function AdminLoginPage() {
  if (await getIsAdmin()) redirect("/admin/returns");

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-xl font-bold">ورود مدیریت</h1>
      <AdminLoginForm />
    </div>
  );
}
