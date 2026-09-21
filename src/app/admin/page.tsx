import { redirect } from "next/navigation";
import { getIsAdmin } from "../lib/admin";

export default async function AdminIndexPage() {
  redirect((await getIsAdmin()) ? "/admin/returns" : "/admin/login");
}
