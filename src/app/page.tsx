"use client";

import Link from "next/link";
import { useVault } from "@/components/VaultProvider";

const STEPS = [
  { n: "01", title: "Create a master password", body: "One password unlocks everything. It never leaves this browser and is never stored.", href: "/setup" },
  { n: "02", title: "Bring in your passwords", body: "Drop in a spreadsheet, a Google export or a Word doc of notes. Or click a built-in sample.", href: "/import" },
  { n: "03", title: "Use the vault", body: "Search, open, copy (the clipboard clears itself in 30 seconds), edit, add new ones.", href: "/vault" },
  { n: "04", title: "Try it on a website", body: "A pretend store shows what the Tesseract browser extension will do: fill logins, make strong passwords, offer to save.", href: "/larkspur/login" },
  { n: "05", title: "Admin", body: "Paste an Anthropic API key to switch import from simulated to real Claude reading. Reset the demo.", href: "/admin" },
];

export default function Home() {
  const { status } = useVault();
  const start =
    status === "none"
      ? { href: "/setup", label: "Start: create a master password" }
      : status === "locked"
        ? { href: "/unlock?next=%2Fvault", label: "Unlock your vault" }
        : { href: "/vault", label: "Open the vault" };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-16">
      <h1 className="text-[clamp(3.2rem,14vw,10rem)] leading-[0.85] font-black tracking-tighter">
        TESSERACT<span className="text-accent">.</span>
      </h1>
      <p className="mt-6 max-w-2xl text-xl leading-snug font-bold sm:text-3xl">
        A password vault that lives in your browser, locked with a key only you hold.
      </p>
      <p className="mt-3 max-w-2xl text-muted sm:text-lg">
        This is a click-through demo. Everything here is fake and stays on this device, encrypted with AES-GCM using a key
        derived from your master password.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href={start.href} className="btn-accent text-lg">
          {start.label} →
        </Link>
      </div>

      <ol className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STEPS.map((s) => (
          <li key={s.n}>
            <Link href={s.href} className="card block h-full transition-colors hover:border-accent">
              <div className="font-mono text-sm font-bold text-accent">{s.n}</div>
              <div className="mt-2 text-2xl leading-tight font-black">{s.title}</div>
              <p className="mt-2 text-muted">{s.body}</p>
            </Link>
          </li>
        ))}
      </ol>
    </main>
  );
}
