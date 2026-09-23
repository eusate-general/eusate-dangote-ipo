"use client";

import { useRouter } from "next/navigation";

export function AdminLogoutButton() {
  const router = useRouter();
  const onClick = async () => {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => undefined);
    router.push("/admin/login");
    router.refresh();
  };

  return (
    <button type="button" onClick={onClick} className="text-sm text-muted underline underline-offset-2">
      Log out
    </button>
  );
}
