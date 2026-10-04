"use client";

import { useEffect, useRef, useState } from "react";
import { Cube } from "./Cube";
import { UnlockPanel } from "./UnlockPanel";
import Link from "next/link";
import { useVault } from "./VaultProvider";
import { strongPassword } from "@/lib/password";
import type { Login } from "@/lib/types";

export const LARKSPUR = { name: "Larkspur Outfitters", host: "larkspuroutfitters.example" };

export function isLarkspur(l: Pick<Login, "site" | "url">): boolean {
  return `${l.site} ${l.url}`.toLowerCase().includes("larkspur");
}

/** Wraps a pretend page: a simulated browser window around an invented store. */
export function LarkspurFrame({ path, bar, children }: { path: string; bar?: React.ReactNode; children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-5xl px-3 py-6 sm:px-4 sm:py-10">
      <div className="mb-4 rounded-2xl border-2 border-accent bg-accent/10 p-4 sm:p-5">
        <div className="text-lg font-black tracking-wide text-accent uppercase sm:text-xl">Simulated website</div>
        <p className="mt-1 text-sm sm:text-base">
          Larkspur Outfitters is invented. <b>This shows how Tesseract autofill works.</b> Look for the <TBadgeGlyph /> cube
          badge inside the password box.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-sm font-bold">
          <Link href="/larkspur/login" className="rounded-lg bg-fg px-3 py-1.5 text-ink">Pretend log-in page</Link>
          <Link href="/larkspur/signup" className="rounded-lg bg-fg px-3 py-1.5 text-ink">Pretend sign-up page</Link>
        </div>
      </div>

      <div className="rounded-2xl border-2 border-line shadow-2xl shadow-black">
        {/* Fake browser chrome */}
        <div className="flex items-center gap-2 rounded-t-[14px] bg-[#2a2a31] px-3 py-2">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          <div className="ml-2 min-w-0 flex-1 truncate rounded-md bg-[#18181d] px-3 py-1 font-mono text-xs text-muted sm:text-sm">
            🔒 https://{LARKSPUR.host}
            {path}
          </div>
        </div>
        <div className="relative">
          {/* Where the extension's bar drops down, just under the address bar */}
          {bar && <div className="pointer-events-none absolute inset-x-0 top-0 z-30 overflow-hidden p-2 pb-8 [&>*]:pointer-events-auto sm:p-3 sm:pb-10">{bar}</div>}
          <div className="rounded-b-[14px] bg-[#f6f1e7] text-[#1f2a1f]">{children}</div>
        </div>
      </div>
    </main>
  );
}

export function LarkspurHeader() {
  return (
    <div className="flex items-center justify-between border-b border-[#d9cfbd] bg-[#21462f] px-5 py-4 text-[#f6f1e7] sm:px-8">
      <div className="font-serif text-xl font-bold tracking-wide sm:text-2xl">⛰ Larkspur Outfitters</div>
      <div className="hidden gap-5 text-sm sm:flex">
        <span>Packs</span>
        <span>Boots</span>
        <span>Tents</span>
        <span>Sale</span>
      </div>
    </div>
  );
}

function TBadgeGlyph() {
  return (
    <span className="mx-0.5 inline-flex align-middle">
      <Cube size={22} />
    </span>
  );
}

type BadgeProps =
  | { mode: "login"; onFill(username: string, password: string): void }
  | { mode: "signup"; onGenerate(password: string): void };

/** The Tesseract badge that sits inside a password box, with its dropdown. */
export function TesseractBadge(props: BadgeProps) {
  const { status, logins } = useVault();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const matches = logins.filter(isLarkspur);

  return (
    <div ref={ref} className="absolute inset-y-0 right-2 flex items-center">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Tesseract autofill"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-[#08080b] ring-2 ring-accent/0 transition hover:ring-accent"
      >
        <Cube size={32} />
      </button>
      {open && (
        <div className="absolute top-full right-0 z-20 mt-2 w-[min(20rem,calc(100vw-3rem))] overflow-hidden rounded-2xl border-2 border-accent bg-panel text-fg shadow-2xl shadow-black/50">
          <div className="flex items-center gap-2 border-b-2 border-line px-4 py-2.5">
            <Cube size={26} />
            <span className="font-black">Tesseract autofill</span>
            <span className="ml-auto text-[10px] font-bold tracking-wider text-muted uppercase">demo</span>
          </div>

          {props.mode === "signup" && (
            <button
              type="button"
              className="flex w-full items-center gap-3 border-b-2 border-line px-4 py-3 text-left hover:bg-panel-2"
              onClick={() => {
                props.onGenerate(strongPassword());
                setOpen(false);
              }}
            >
              <span className="text-xl">⚡</span>
              <span>
                <span className="block font-black text-accent">Create strong password</span>
                <span className="text-xs text-muted">20 random characters, fills both boxes</span>
              </span>
            </button>
          )}

          {props.mode === "login" &&
            (status === "unlocked" ? (
              matches.length ? (
                <ul className="max-h-72 overflow-y-auto">
                  <li className="px-4 pt-3 pb-1 text-[10px] font-bold tracking-wider text-muted uppercase">Saved for {LARKSPUR.host}</li>
                  {matches.map((l) => (
                    <li key={l.id}>
                      <button
                        type="button"
                        className="w-full px-4 py-3 text-left hover:bg-panel-2"
                        onClick={() => {
                          props.onFill(l.username, l.password);
                          setOpen(false);
                        }}
                      >
                        <span className="block truncate font-black">{l.username || "(no username)"}</span>
                        <span className="block text-xs text-muted">{l.site} · ••••••••</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-4 text-sm">
                  <p className="font-bold">No saved logins for {LARKSPUR.host}.</p>
                  <p className="mt-1 text-muted">
                    Import a sample (they include Larkspur logins) or create an account on the{" "}
                    <Link href="/larkspur/signup" className="underline">sign-up page</Link>.
                  </p>
                </div>
              )
            ) : (
              <VaultGate />
            ))}
        </div>
      )}
    </div>
  );
}

/** Shown in the dropdown or save bar when the vault isn't open. */
export function VaultGate() {
  const { status } = useVault();
  if (status === "none") {
    return (
      <div className="p-4 text-sm">
        <p className="font-bold">Tesseract isn&apos;t set up on this laptop yet.</p>
        <Link href="/setup" className="btn-accent btn-sm mt-3">Set up Tesseract</Link>
      </div>
    );
  }
  return <UnlockPanel variant="inline" autoPrompt />;
}
