"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useVault } from "./VaultProvider";

/** Sends people to first-run or unlock when the vault isn't open. */
export function RequireUnlocked({ children }: { children: React.ReactNode }) {
  const { status } = useVault();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "none") router.replace("/setup");
    else if (status === "locked") router.replace(`/unlock?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  if (status !== "unlocked") {
    return <div className="flex flex-1 items-center justify-center p-10 text-muted">Opening the vault…</div>;
  }
  return <>{children}</>;
}

export function Page({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return <main className={`mx-auto w-full ${wide ? "max-w-6xl" : "max-w-3xl"} px-4 py-8 sm:py-12`}>{children}</main>;
}
