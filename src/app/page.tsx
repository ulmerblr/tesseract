"use client";

import Image from "next/image";
import Link from "next/link";
import { useVault } from "@/components/VaultProvider";
import { LocalPromise } from "@/components/LocalPromise";

const STEPS = [
  { n: "01", title: "Create a master password", body: "One password unlocks everything. It never leaves this laptop and is never stored.", href: "/setup" },
  { n: "02", title: "Turn on face or fingerprint", body: "Optional. Windows Hello or Touch ID unlocks the vault through a passkey. Your face and fingerprint never leave the operating system.", href: "/admin" },
  { n: "03", title: "Bring in your passwords", body: "Drop in a spreadsheet, a Google export or a Word doc of notes. Or click a built-in sample.", href: "/import" },
  { n: "04", title: "Use the vault", body: "Search, open, copy (the clipboard clears itself in 30 seconds), edit, add new ones.", href: "/vault" },
  { n: "05", title: "Try Tesseract autofill", body: "A pretend store shows how Tesseract autofill works: fill logins, make strong passwords, offer to save.", href: "/larkspur/login" },
  { n: "06", title: "Admin", body: "Paste an Anthropic API key to switch import from simulated to real Claude reading. Reset the demo.", href: "/admin" },
];

export default function Home() {
  const { status } = useVault();
  const enter = status === "none" ? "/setup" : status === "locked" ? "/unlock?next=%2Fvault" : "/vault";

  return (
    <main className="w-full">
      <section className="relative flex flex-col items-center px-4 pt-4 pb-12 text-center sm:pb-16">
        {/* The logo's black background disappears into the page: lighten keeps whichever is brighter,
            and the radial mask feathers the edges of the image. */}
        <Image
          src="/brand/tesseract-logo-dark-1024.webp"
          alt="Tesseract"
          width={1024}
          height={1024}
          priority
          className="h-auto w-[min(92vw,620px)] mix-blend-lighten [mask-image:radial-gradient(closest-side,#000_78%,transparent)]"
        />
        <p className="-mt-2 max-w-3xl text-3xl leading-tight font-black tracking-tight sm:-mt-6 sm:text-5xl">
          Your passwords. Your machine. <span className="text-accent">Nobody else.</span>
        </p>
        <LocalPromise className="mt-5" />
        <Link
          href={enter}
          className="btn-accent mt-8 px-10 py-5 text-xl shadow-[0_0_40px_-6px_var(--color-accent)] sm:text-2xl"
        >
          Enter the Demo
        </Link>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <p className="mx-auto max-w-2xl text-center text-muted sm:text-lg">
          This is a click-through demo. Everything here is fake and stays on this device, encrypted with AES-GCM under a
          random vault key that only your master password, or your face or fingerprint, can unlock.
        </p>
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
      </section>
    </main>
  );
}
