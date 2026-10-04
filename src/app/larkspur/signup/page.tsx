"use client";

import { useState } from "react";
import Link from "next/link";
import { isLarkspur, LARKSPUR, LarkspurFrame, LarkspurHeader, TesseractBadge, VaultGate } from "@/components/Larkspur";
import { useVault } from "@/components/VaultProvider";
import { Cube } from "@/components/Cube";

type Bar = { kind: "hidden" } | { kind: "offer" } | { kind: "saved"; updated: boolean } | { kind: "dismissed" };

const inputCls =
  "w-full rounded-lg border border-[#b9ae99] bg-white px-3 py-3 text-base text-[#1f2a1f] focus:border-[#21462f] focus:outline-none";

export default function LarkspurSignup() {
  const { status, logins, addLogins, updateLogin } = useVault();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(false);
  const [bar, setBar] = useState<Bar>({ kind: "hidden" });

  const existing = logins.find((l) => isLarkspur(l) && l.username.toLowerCase() === email.trim().toLowerCase());
  const isUpdate = Boolean(existing && existing.password !== password);
  const alreadySaved = Boolean(existing && existing.password === password);

  async function save() {
    if (existing) {
      await updateLogin(existing.id, { ...existing, password });
      setBar({ kind: "saved", updated: true });
    } else {
      await addLogins([
        {
          site: LARKSPUR.name,
          url: `https://${LARKSPUR.host}/login`,
          username: email.trim(),
          password,
          hints: [],
          questions: [],
          notes: ["Saved from the Larkspur sign-up page."],
        },
      ]);
      setBar({ kind: "saved", updated: false });
    }
  }

  const showBar = bar.kind !== "hidden" && bar.kind !== "dismissed";
  const barNode = showBar && (
    <div className="mx-auto w-full max-w-2xl [animation:drop_.35s_ease-out] rounded-2xl border-2 border-accent bg-panel p-4 shadow-2xl shadow-black sm:p-5">
      <div className="flex items-start gap-3">
        <Cube size={40} />
        <div className="min-w-0 flex-1">
          {bar.kind === "saved" ? (
            <>
              <div className="text-lg font-black">{bar.updated ? "Password updated in Tesseract." : "Saved to Tesseract."}</div>
              <p className="text-sm text-muted">
                {LARKSPUR.host} · <span className="break-all">{email}</span> ·{" "}
                <Link href="/vault" className="underline">see it in the vault</Link>
              </p>
            </>
          ) : status !== "unlocked" ? (
            <>
              <div className="text-lg font-black">Save this login to Tesseract?</div>
              <div className="mt-2 -mx-4 -mb-4">
                <VaultGate />
              </div>
            </>
          ) : alreadySaved ? (
            <div className="text-lg font-black">This login is already saved in Tesseract.</div>
          ) : (
            <>
              <div className="text-lg font-black">{isUpdate ? "Update the saved password?" : "Save this login to Tesseract?"}</div>
              <p className="text-sm text-muted">
                {LARKSPUR.host} · <span className="break-all">{email}</span>
                {isUpdate && " · a different password is saved for this username"}
              </p>
            </>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {bar.kind === "offer" && status === "unlocked" && !alreadySaved && (
          <button className="btn-accent btn-sm" onClick={() => void save()}>
            {isUpdate ? "Update" : "Save"}
          </button>
        )}
        <button className="btn-ghost btn-sm" onClick={() => setBar({ kind: "dismissed" })}>
          {bar.kind === "offer" && !alreadySaved ? "Not Now" : "Close"}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <LarkspurFrame path="/signup" bar={barNode}>
        <LarkspurHeader />
        {created ? (
          <div className="px-5 py-16 text-center sm:px-8 sm:py-24">
            <div className="text-6xl">🏕</div>
            <h1 className="mt-4 font-serif text-4xl font-bold sm:text-6xl">Account created.</h1>
            <p className="mt-4 text-lg text-[#4a5a4a]">
              Welcome, {name || "explorer"}. (Pretend account — nothing was sent anywhere.)
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/larkspur/login" className="rounded-xl bg-[#21462f] px-6 py-3 font-bold text-white">Go to log in</Link>
              <button
                className="rounded-xl border border-[#21462f] px-6 py-3 font-bold text-[#21462f]"
                onClick={() => {
                  setCreated(false);
                  setBar({ kind: "hidden" });
                  setPassword("");
                  setConfirm("");
                }}
              >
                Sign up again
              </button>
            </div>
          </div>
        ) : (
          <form
            className="mx-auto grid max-w-md gap-4 px-5 py-10 sm:py-14"
            onSubmit={(e) => {
              e.preventDefault();
              if (!email.trim() || !password) return setError("Enter an email and a password.");
              if (password !== confirm) return setError("The passwords don't match.");
              setError("");
              setCreated(true);
              setBar({ kind: "offer" });
            }}
          >
            <h1 className="font-serif text-4xl font-bold">Create your account</h1>
            <p className="text-[#4a5a4a]">Members get trail maps and early access to the sale.</p>
            <label className="grid gap-1 text-sm font-semibold">
              Name
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Email
              <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
            </label>
            <div className="grid gap-1 text-sm font-semibold">
              <label htmlFor="lk-new-password">Password</label>
              <div className="relative">
                <input
                  id="lk-new-password"
                  type={showPw ? "text" : "password"}
                  className={`${inputCls} pr-12 font-mono`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="off"
                />
                <TesseractBadge
                  mode="signup"
                  onGenerate={(p) => {
                    setPassword(p);
                    setConfirm(p);
                    setShowPw(true);
                  }}
                />
              </div>
            </div>
            <label className="grid gap-1 text-sm font-semibold">
              Confirm password
              <input
                type={showPw ? "text" : "password"}
                className={`${inputCls} font-mono`}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} /> Show passwords
            </label>
            {error && <p className="font-semibold text-[#b3261e]">{error}</p>}
            <button className="mt-2 rounded-xl bg-[#21462f] px-6 py-3 text-lg font-bold text-white hover:bg-[#183522]">Create account</button>
            <p className="text-center text-sm text-[#4a5a4a]">
              Already a member? <Link href="/larkspur/login" className="font-bold underline">Sign in</Link>
            </p>
          </form>
        )}
      </LarkspurFrame>
    </>
  );
}
