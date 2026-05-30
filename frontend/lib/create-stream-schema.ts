import { z } from "zod";
import { isAddress } from "viem";

/**
 * Form schema + helpers for /streams/new.
 *
 * The form stores durations in canonical seconds; the UI uses
 * (number, unit) pickers and computes seconds on the fly via the
 * `toSeconds` helpers.
 */

export const CYCLE_COST_STT = 0.36;        // 0.12 JSON API + 0.24 LLM
export const DEFAULT_FUNDING_CYCLES = 8;   // suggested initial DripPolicies funding

export const policyEnabledSchema = z.object({
  enabled: z.literal(true),
  githubUsername: z
    .string()
    .trim()
    .min(1, "Required")
    .max(40, "Too long")
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*$/, "Letters, numbers, single hyphens"),
  githubRepo: z
    .string()
    .trim()
    .min(3, "Use owner/name")
    .regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/, "Must be owner/name"),
  checkIntervalSec: z
    .number()
    .int("Must be a whole number")
    .min(60, "Minimum 60 seconds")
    .max(7_776_000, "Maximum 90 days"),
  windowDays: z
    .number()
    .int("Whole number")
    .min(1, "≥ 1")
    .max(90, "≤ 90"),
  fundingStt: z
    .number()
    .min(CYCLE_COST_STT, `≥ ${CYCLE_COST_STT} STT (one cycle)`)
    .max(50, "Cap at 50 STT for safety — top up later if needed"),
});

export const policyDisabledSchema = z.object({
  enabled: z.literal(false),
});

export const policySchema = z.discriminatedUnion("enabled", [
  policyEnabledSchema,
  policyDisabledSchema,
]);

export const createFormSchema = z.object({
  recipient: z
    .string()
    .trim()
    .min(1, "Required")
    .refine((v) => Boolean(isAddress(v)), "Not a valid Ethereum address"),
  amountStt: z
    .number()
    .positive("Must be > 0")
    .max(1_000, "Cap at 1000 STT for testnet safety"),
  durationSec: z
    .number()
    .int("Whole number")
    .min(60, "Minimum 60 seconds")
    .max(31_536_000, "Maximum 1 year"),
  policy: policySchema,
});

export type CreateFormValues = z.infer<typeof createFormSchema>;

/* ------------------------------------------------------------------ */
/*  Duration / interval helpers                                         */
/* ------------------------------------------------------------------ */

export type Unit = "minutes" | "hours" | "days" | "weeks";

export const UNIT_SECONDS: Record<Unit, number> = {
  minutes: 60,
  hours: 3600,
  days: 86400,
  weeks: 604800,
};

export function toSeconds(value: number, unit: Unit): number {
  return Math.floor(value * UNIT_SECONDS[unit]);
}

export function fromSeconds(sec: number): { value: number; unit: Unit } {
  if (sec % UNIT_SECONDS.weeks === 0 && sec >= UNIT_SECONDS.weeks)
    return { value: sec / UNIT_SECONDS.weeks, unit: "weeks" };
  if (sec % UNIT_SECONDS.days === 0 && sec >= UNIT_SECONDS.days)
    return { value: sec / UNIT_SECONDS.days, unit: "days" };
  if (sec % UNIT_SECONDS.hours === 0 && sec >= UNIT_SECONDS.hours)
    return { value: sec / UNIT_SECONDS.hours, unit: "hours" };
  return { value: Math.max(1, Math.floor(sec / UNIT_SECONDS.minutes)), unit: "minutes" };
}

/* ------------------------------------------------------------------ */
/*  Aggregator URL preview                                              */
/* ------------------------------------------------------------------ */

/** Origin used for the deployed aggregator. Override via env at build time. */
export function aggregatorOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_AGGREGATOR_ORIGIN || "https://drip-frontend-psi.vercel.app"
  );
}

export function buildDataUrl(args: {
  username: string;
  repo: string;
  windowDays: number;
}): string {
  const u = new URL(`${aggregatorOrigin()}/api/github-activity`);
  u.searchParams.set("username", args.username);
  u.searchParams.set("repo", args.repo);
  u.searchParams.set("windowDays", String(args.windowDays));
  return u.toString();
}

/* ------------------------------------------------------------------ */
/*  Cost helpers                                                        */
/* ------------------------------------------------------------------ */

export interface CostBreakdown {
  streamAmountStt: number;
  cyclesEstimated: number;
  cyclesFunded: number;
  policyFundingStt: number;
  totalSendStt: number;
}

export function estimateCost(form: CreateFormValues): CostBreakdown {
  const streamAmountStt = form.amountStt;
  const cyclesEstimated =
    form.policy.enabled && form.policy.checkIntervalSec > 0
      ? Math.floor(form.durationSec / form.policy.checkIntervalSec)
      : 0;
  const policyFundingStt = form.policy.enabled ? form.policy.fundingStt : 0;
  const cyclesFunded = policyFundingStt > 0 ? Math.floor(policyFundingStt / CYCLE_COST_STT) : 0;
  const totalSendStt = streamAmountStt + policyFundingStt;
  return {
    streamAmountStt,
    cyclesEstimated,
    cyclesFunded,
    policyFundingStt,
    totalSendStt,
  };
}

/** Suggested upfront funding given (interval, duration). Caps at DEFAULT_FUNDING_CYCLES cycles. */
export function suggestedFundingStt(
  durationSec: number,
  intervalSec: number,
): number {
  if (intervalSec <= 0) return CYCLE_COST_STT * 2;
  const totalCycles = Math.floor(durationSec / intervalSec);
  const funded = Math.min(DEFAULT_FUNDING_CYCLES, Math.max(2, totalCycles));
  return Math.round(funded * CYCLE_COST_STT * 100) / 100;
}
