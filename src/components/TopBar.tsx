"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useVault } from "./VaultProvider";
import { Cube } from "./Cube";

const LINKS = [
  { href: "/", label: "Tour" },
  { href: "/vault", label: "Vault" },
  { href: "/import", label: "Import" },
  { href: "/larkspur/login", label: "Pretend site" },
  { href: "/admin", label: "Admin" },
];

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function TopBar() {
  const { status, lock, lockInSeconds, autoLockPaused } = useVault();
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40">
      <div
        className="bg-danger px-4 py-2 text-center text-[13px] leading-tight font-black tracking-wide text-white uppercase sm:text-base"
      >
        Demo — fake data only. Do not enter real passwords.
      </div>
      <div className="border-b-2 border-line bg-ink/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          {pathname !== "/" && (
            <Link href="/" className="flex items-center gap-2 text-xl font-black tracking-tighter sm:text-2xl" aria-label="Tesseract home">
              <Cube size={36} />
              <span className="hidden sm:inline">TESSERACT</span>
            </Link>
          )}
          <nav className="hidden flex-1 items-center gap-1 md:flex">
            {LINKS.map((l) => (
              <NavLink key={l.href} href={l.href} label={l.label} active={isActive(pathname, l.href)} />
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {status === "unlocked" ? (
              <>
                <span className="hidden font-mono text-xs text-muted sm:inline" title="Locks itself after 2 minutes without activity">
                  {autoLockPaused ? "auto-lock paused: import pending" : `auto-lock ${fmt(lockInSeconds)}`}
                </span>
                <button onClick={lock} className="btn-accent btn-sm">
                  <LockIcon /> Lock
                </button>
              </>
            ) : status === "locked" ? (
              <Link href={`/unlock?next=${encodeURIComponent(pathname)}`} className="btn-ghost btn-sm">
                <LockIcon /> Locked
              </Link>
            ) : null}
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden">
          {LINKS.map((l) => (
            <NavLink key={l.href} href={l.href} label={l.label} active={isActive(pathname, l.href)} />
          ))}
        </nav>
      </div>
    </header>
  );
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href.startsWith("/larkspur")) return pathname.startsWith("/larkspur");
  return pathname.startsWith(href);
}

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-bold whitespace-nowrap ${
        active ? "bg-fg text-ink" : "text-muted hover:text-fg"
      }`}
    >
      {label}
    </Link>
  );
}

export function LockIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className={className} aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
