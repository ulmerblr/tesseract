"use client";

import { useState } from "react";
import { LarkspurFrame, LarkspurHeader, TesseractBadge } from "@/components/Larkspur";

export default function LarkspurLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [error, setError] = useState("");

  return (
    <LarkspurFrame path="/login">
      <LarkspurHeader />
      {loggedIn ? (
        <div className="px-5 py-16 text-center sm:px-8 sm:py-24">
          <div className="text-6xl">🎉</div>
          <h1 className="mt-4 font-serif text-5xl font-bold sm:text-7xl">You&apos;re in.</h1>
          <p className="mt-4 text-lg text-[#4a5a4a]">
            Welcome back, <b className="break-all">{username}</b>. (Pretend account — nothing was checked or sent anywhere.)
          </p>
          <button
            className="mt-8 rounded-xl bg-[#21462f] px-6 py-3 font-bold text-white"
            onClick={() => {
              setLoggedIn(false);
              setPassword("");
              setUsername("");
            }}
          >
            Log out
          </button>
        </div>
      ) : (
        <form
          className="mx-auto grid max-w-md gap-4 px-5 py-10 sm:py-14"
          onSubmit={(e) => {
            e.preventDefault();
            if (!username || !password) return setError("Enter your email and password.");
            setError("");
            setLoggedIn(true);
          }}
        >
          <h1 className="font-serif text-4xl font-bold">Sign in</h1>
          <p className="text-[#4a5a4a]">Track orders and save your trail list.</p>
          <label className="grid gap-1 text-sm font-semibold">
            Email or username
            <input
              className="rounded-lg border border-[#b9ae99] bg-white px-3 py-3 text-base text-[#1f2a1f] focus:border-[#21462f] focus:outline-none"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
            />
          </label>
          <div className="grid gap-1 text-sm font-semibold">
            <label htmlFor="lk-password">Password</label>
            <div className="relative">
              <input
                id="lk-password"
                type="password"
                className="w-full rounded-lg border border-[#b9ae99] bg-white py-3 pr-12 pl-3 text-base text-[#1f2a1f] focus:border-[#21462f] focus:outline-none"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
              />
              <TesseractBadge
                mode="login"
                onFill={(u, p) => {
                  setUsername(u);
                  setPassword(p);
                }}
              />
            </div>
          </div>
          {error && <p className="font-semibold text-[#b3261e]">{error}</p>}
          <button className="mt-2 rounded-xl bg-[#21462f] px-6 py-3 text-lg font-bold text-white hover:bg-[#183522]">Log in</button>
          <p className="text-center text-sm text-[#4a5a4a]">
            New here? <a href="/larkspur/signup" className="font-bold underline">Create an account</a>
          </p>
        </form>
      )}
    </LarkspurFrame>
  );
}
