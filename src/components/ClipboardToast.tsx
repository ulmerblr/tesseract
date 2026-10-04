"use client";

import { CLIPBOARD_SECONDS, useVault } from "./VaultProvider";

export function ClipboardToast() {
  const { clip, clearClipboardNow } = useVault();
  if (!clip) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-md overflow-hidden rounded-2xl border-2 border-accent bg-panel shadow-2xl shadow-black">
        {clip.secondsLeft > 0 ? (
          <>
            <div className="flex items-center gap-3 p-4">
              <div className="font-mono text-3xl font-black text-accent tabular-nums">{clip.secondsLeft}s</div>
              <div className="flex-1 text-sm leading-snug">
                <b>{clip.label} copied.</b>
                <br />
                <span className="text-muted">Clipboard clears itself when the timer runs out.</span>
              </div>
              <button onClick={clearClipboardNow} className="btn-ghost btn-sm">
                Clear now
              </button>
            </div>
            <div className="h-1.5 bg-line">
              <div
                className="h-full bg-accent transition-[width] duration-300 ease-linear"
                style={{ width: `${(clip.secondsLeft / CLIPBOARD_SECONDS) * 100}%` }}
              />
            </div>
          </>
        ) : (
          <div className="p-4 text-sm font-bold">{clip.message}</div>
        )}
      </div>
    </div>
  );
}
