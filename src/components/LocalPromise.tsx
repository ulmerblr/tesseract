import { LockIcon } from "./TopBar";

export const LOCAL_PROMISE = "Stored on this laptop. Never sent to the internet, the cloud, or anyone.";

/** The standard local-only promise line. */
export function LocalPromise({ className = "" }: { className?: string }) {
  return (
    <p className={`flex items-center justify-center gap-2 text-center text-base font-bold text-fg sm:text-lg ${className}`}>
      <LockIcon className="h-5 w-5 shrink-0 text-accent" />
      <span>{LOCAL_PROMISE}</span>
    </p>
  );
}
