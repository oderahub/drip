import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * The canonical class-name helper — combines clsx (conditional class
 * composition) with tailwind-merge (intelligent conflict resolution so
 * later utility classes properly override earlier ones).
 *
 * Used by every component that takes a `className` prop.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a bigint amount in wei to a fixed number of STT decimals. */
export function formatStt(wei: bigint, decimals = 4): string {
  const whole = wei / 10n ** 18n;
  const frac = wei % 10n ** 18n;
  if (decimals === 0) return whole.toString();
  const fracStr = (frac + 10n ** 18n).toString().slice(1, 1 + decimals);
  return `${whole.toString()}.${fracStr}`;
}

/** Shorten an Ethereum address for display: 0xABCD…1234 */
export function shortAddress(addr: string, head = 6, tail = 4): string {
  if (!addr || !addr.startsWith("0x") || addr.length < head + tail + 2) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

/** Relative time string ("3 minutes ago") — wrapper around date-fns. */
export function relativeFromUnix(unixSec: number): string {
  if (!unixSec) return "—";
  const date = new Date(unixSec * 1000);
  const now = Date.now();
  const diff = (now - date.getTime()) / 1000; // sec
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return `${Math.floor(diff / 86400)} d ago`;
}
