"use client";

import { useState } from "react";
import { adminLoginAction } from "../../_actions/admin-actions";

export function AdminLoginForm() {
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setError(null);
    const result = await adminLoginAction(formData);
    // A successful login redirects server-side and never returns here.
    if (result && !result.ok) setError(result.error ?? "خطایی رخ داد.");
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5">
      <label htmlFor="admin-token" className="text-sm font-medium">
        توکن مدیریت
      </label>
      <input
        id="admin-token"
        type="password"
        name="token"
        required
        className="ltr-run rounded-md border border-line bg-surface-sunken px-3 py-2"
        dir="ltr"
        autoComplete="off"
      />
      <button type="submit" className="rounded-md bg-brand px-4 py-2 font-semibold text-white">
        ورود
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}
