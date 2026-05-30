"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { parseEther, parseEventLogs, type Address } from "viem";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Loader2,
  WalletMinimal,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { StepIndicator } from "@/components/create-stream/progress";
import { CostBreakdownPanel } from "@/components/create-stream/cost-breakdown";
import { AggregatorPreview } from "@/components/create-stream/aggregator-preview";
import { WalletConnectButton } from "@/components/connect-button";

import {
  createFormSchema,
  type CreateFormValues,
  toSeconds,
  fromSeconds,
  type Unit,
  buildDataUrl,
  estimateCost,
  suggestedFundingStt,
  CYCLE_COST_STT,
} from "@/lib/create-stream-schema";
import { dripAbi } from "@/lib/abi/drip";
import { dripPoliciesAbi } from "@/lib/abi/drip-policies";
import { ADDRESSES } from "@/lib/contracts";
import { cn, shortAddress } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Step container                                                      */
/* ------------------------------------------------------------------ */

export function CreateStreamWizard() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const addrs =
    chainId === 5031 ? ADDRESSES.mainnet : ADDRESSES.testnet;

  /* ---- form ---- */
  const form = useForm<CreateFormValues>({
    resolver: zodResolver(createFormSchema),
    mode: "onChange",
    defaultValues: {
      recipient: "",
      amountStt: 1,
      durationSec: toSeconds(1, "hours"),
      policy: {
        enabled: true,
        githubUsername: "",
        githubRepo: "",
        checkIntervalSec: toSeconds(2, "minutes"),
        windowDays: 7,
        fundingStt: suggestedFundingStt(toSeconds(1, "hours"), toSeconds(2, "minutes")),
      },
    },
  });

  const { control, watch, setValue, trigger, getValues, formState } = form;
  const values = watch();
  const cost = estimateCost(values);

  /* ---- unit pickers persist between steps ---- */
  const [durUnit, setDurUnit] = React.useState<Unit>("hours");
  const [intervalUnit, setIntervalUnit] = React.useState<Unit>("minutes");

  /* ---- step navigation ---- */
  const [step, setStep] = React.useState<1 | 2 | 3>(1);

  const goNext = async () => {
    const fields: ("recipient" | "amountStt" | "durationSec" | "policy")[] =
      step === 1
        ? ["recipient", "amountStt", "durationSec"]
        : step === 2
          ? ["policy"]
          : [];
    const ok = fields.length === 0 ? true : await trigger(fields);
    if (!ok) return;
    setStep((s) => (s === 1 ? 2 : s === 2 ? 3 : s));
  };

  /* ---- submit ---- */
  type Phase =
    | "idle"
    | "submitting-create"
    | "confirming-create"
    | "submitting-policy"
    | "confirming-policy"
    | "done"
    | "create-failed"
    | "policy-failed";

  const [phase, setPhase] = React.useState<Phase>("idle");
  const [createTxHash, setCreateTxHash] = React.useState<`0x${string}` | null>(null);
  const [policyTxHash, setPolicyTxHash] = React.useState<`0x${string}` | null>(null);
  const [createdStreamId, setCreatedStreamId] = React.useState<bigint | null>(null);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const explorerTx = (h: string) =>
    `https://shannon-explorer.somnia.network/tx/${h}`;

  const submit = async () => {
    if (!publicClient || !isConnected) return;
    const v = getValues();
    setSubmitError(null);

    /* --- tx 1: createStream --- */
    let streamId: bigint;
    try {
      setPhase("submitting-create");
      toast.loading("Submitting createStream…", { id: "create-tx" });
      const hash = await writeContractAsync({
        address: addrs.drip,
        abi: dripAbi,
        functionName: "createStream",
        args: [v.recipient as Address, BigInt(v.durationSec)],
        value: parseEther(v.amountStt.toString()),
      });
      setCreateTxHash(hash);
      toast.dismiss("create-tx");
      toast.success("createStream submitted", {
        description: "Waiting for confirmation…",
        action: { label: "View", onClick: () => window.open(explorerTx(hash), "_blank") },
      });
      setPhase("confirming-create");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      // Parse the StreamCreated log to get the streamId
      const decoded = parseEventLogs({
        abi: dripAbi,
        logs: receipt.logs,
        eventName: "StreamCreated",
      });
      if (decoded.length === 0 || !decoded[0].args) {
        throw new Error("StreamCreated event missing from receipt");
      }
      streamId = (decoded[0].args as { streamId: bigint }).streamId;
      setCreatedStreamId(streamId);
      toast.success(`Stream #${streamId} created`);
    } catch (err) {
      toast.dismiss("create-tx");
      const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
      setSubmitError(msg);
      setPhase("create-failed");
      toast.error("createStream failed", { description: msg });
      return;
    }

    /* --- tx 2: registerPolicy (only if enabled) --- */
    if (!v.policy.enabled) {
      setPhase("done");
      // Navigate to the new stream
      setTimeout(() => router.push(`/streams/${streamId}`), 600);
      return;
    }

    try {
      setPhase("submitting-policy");
      toast.loading("Submitting registerPolicy…", { id: "policy-tx" });
      const dataUrl = buildDataUrl({
        username: v.policy.githubUsername,
        repo: v.policy.githubRepo,
        windowDays: v.policy.windowDays,
      });
      const cfg = {
        githubUsername: v.policy.githubUsername,
        githubRepo: v.policy.githubRepo,
        dataUrl,
        dataSelector: "json",
        checkIntervalSeconds: BigInt(v.policy.checkIntervalSec),
      } as const;
      const hash = await writeContractAsync({
        address: addrs.dripPolicies,
        abi: dripPoliciesAbi,
        functionName: "registerPolicy",
        args: [streamId, cfg],
        value: parseEther(v.policy.fundingStt.toString()),
      });
      setPolicyTxHash(hash);
      toast.dismiss("policy-tx");
      toast.success("registerPolicy submitted", {
        description: "Waiting for confirmation…",
        action: { label: "View", onClick: () => window.open(explorerTx(hash), "_blank") },
      });
      setPhase("confirming-policy");
      await publicClient.waitForTransactionReceipt({ hash });
      toast.success(`Policy registered for stream #${streamId}`);
      setPhase("done");
      setTimeout(() => router.push(`/streams/${streamId}`), 600);
    } catch (err) {
      toast.dismiss("policy-tx");
      const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
      setSubmitError(msg);
      setPhase("policy-failed");
      toast.error("registerPolicy failed", { description: msg });
    }
  };

  /* ---- not connected ---- */
  if (!isConnected) {
    return (
      <Card className="mx-auto max-w-md px-6 py-10 text-center">
        <span
          aria-hidden
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"
        >
          <WalletMinimal className="h-5 w-5" />
        </span>
        <h2 className="text-lg font-semibold tracking-tight">Connect to create a stream</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Streams are signed by you and start flowing immediately. We never custody funds.
        </p>
        <div className="mt-5 inline-flex">
          <WalletConnectButton />
        </div>
      </Card>
    );
  }

  return (
    <div>
      <StepIndicator current={step} />

      {/* ============ STEP 1 — STREAM ============ */}
      {step === 1 && (
        <Card className="p-5 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Step 1 · Stream
          </p>
          <h2 className="mt-1.5 text-xl font-semibold tracking-tight sm:text-2xl">
            Who, how much, how long.
          </h2>

          <div className="mt-6 space-y-5">
            {/* recipient */}
            <div className="space-y-1.5">
              <Label htmlFor="recipient">Recipient address</Label>
              <Controller
                control={control}
                name="recipient"
                render={({ field, fieldState }) => (
                  <>
                    <Input
                      {...field}
                      id="recipient"
                      placeholder="0x…"
                      autoComplete="off"
                      error={fieldState.error?.message}
                      className="font-mono"
                    />
                    {address && (
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">
                          Send a stream to yourself? Drip allows it.
                        </span>
                        <button
                          type="button"
                          className="font-medium text-primary hover:underline"
                          onClick={() => setValue("recipient", address, { shouldValidate: true })}
                        >
                          Use {shortAddress(address)}
                        </button>
                      </div>
                    )}
                    <FieldError error={fieldState.error?.message} />
                  </>
                )}
              />
            </div>

            {/* amount */}
            <div className="space-y-1.5">
              <Label htmlFor="amount">Total amount</Label>
              <Controller
                control={control}
                name="amountStt"
                render={({ field, fieldState }) => (
                  <div className="space-y-1">
                    <div className="relative">
                      <Input
                        id="amount"
                        type="number"
                        step="0.0001"
                        min="0"
                        value={Number.isFinite(field.value) ? field.value : ""}
                        onChange={(e) => field.onChange(numFromInput(e.target.value))}
                        onBlur={field.onBlur}
                        ref={field.ref}
                        error={fieldState.error?.message}
                        className="pr-14 font-numeric"
                      />
                      <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
                        STT
                      </span>
                    </div>
                    <FieldError error={fieldState.error?.message} />
                  </div>
                )}
              />
            </div>

            {/* duration */}
            <div className="space-y-1.5">
              <Label htmlFor="duration">Duration</Label>
              <Controller
                control={control}
                name="durationSec"
                render={({ field, fieldState }) => {
                  const cur = fromSeconds(field.value);
                  return (
                    <div>
                      <div className="grid grid-cols-[1fr_auto] gap-2">
                        <Input
                          id="duration"
                          type="number"
                          step="1"
                          min="1"
                          value={cur.value}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v) && v >= 0) {
                              field.onChange(toSeconds(v, durUnit));
                            }
                          }}
                          onBlur={field.onBlur}
                          error={fieldState.error?.message}
                          className="font-numeric"
                        />
                        <Select
                          value={durUnit}
                          onChange={(e) => {
                            const u = e.target.value as Unit;
                            setDurUnit(u);
                            field.onChange(toSeconds(cur.value, u));
                          }}
                          className="w-32"
                        >
                          <option value="minutes">minutes</option>
                          <option value="hours">hours</option>
                          <option value="days">days</option>
                          <option value="weeks">weeks</option>
                        </Select>
                      </div>
                      <FieldError error={fieldState.error?.message} />
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        Rate at <span className="font-mono">{(values.amountStt / Math.max(1, field.value)).toExponential(2)}</span> STT/s
                      </p>
                    </div>
                  );
                }}
              />
            </div>
          </div>

          <StepActions onNext={goNext} />
        </Card>
      )}

      {/* ============ STEP 2 — POLICY ============ */}
      {step === 2 && (
        <Card className="p-5 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Step 2 · Policy
          </p>
          <h2 className="mt-1.5 text-xl font-semibold tracking-tight sm:text-2xl">
            What should the agent watch?
          </h2>

          {/* enabled toggle */}
          <Controller
            control={control}
            name="policy.enabled"
            render={({ field }) => (
              <div className="mt-5 flex items-center justify-between rounded-2xl border border-border bg-muted/30 p-4">
                <div>
                  <p className="text-sm font-semibold">Register an activity policy</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Off = simple time-based stream. On = AI pauses payment if the contributor goes
                    dormant.
                  </p>
                </div>
                <Switch
                  checked={field.value}
                  onCheckedChange={(v) => {
                    field.onChange(v);
                    if (v && values.policy && !values.policy.enabled) {
                      // Repopulate sensible defaults when turning ON
                      setValue("policy", {
                        enabled: true,
                        githubUsername: "",
                        githubRepo: "",
                        checkIntervalSec: values.durationSec >= 86400 ? 86400 : Math.max(60, Math.floor(values.durationSec / 6)),
                        windowDays: 7,
                        fundingStt: suggestedFundingStt(values.durationSec, Math.max(60, Math.floor(values.durationSec / 6))),
                      } as never);
                    }
                  }}
                  aria-label="Toggle policy"
                />
              </div>
            )}
          />

          {values.policy.enabled && (
            <div className="mt-6 space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Controller
                  control={control}
                  name="policy.githubUsername"
                  render={({ field, fieldState }) => (
                    <div className="space-y-1.5">
                      <Label htmlFor="gh-user">GitHub username</Label>
                      <Input
                        {...field}
                        id="gh-user"
                        placeholder="ijjk"
                        autoComplete="off"
                        error={fieldState.error?.message}
                      />
                      <FieldError error={fieldState.error?.message} />
                    </div>
                  )}
                />
                <Controller
                  control={control}
                  name="policy.githubRepo"
                  render={({ field, fieldState }) => (
                    <div className="space-y-1.5">
                      <Label htmlFor="gh-repo">Repo (owner/name)</Label>
                      <Input
                        {...field}
                        id="gh-repo"
                        placeholder="vercel/next.js"
                        autoComplete="off"
                        error={fieldState.error?.message}
                      />
                      <FieldError error={fieldState.error?.message} />
                    </div>
                  )}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Controller
                  control={control}
                  name="policy.checkIntervalSec"
                  render={({ field, fieldState }) => {
                    const cur = fromSeconds(field.value);
                    return (
                      <div className="space-y-1.5">
                        <Label htmlFor="interval">Check every</Label>
                        <div className="grid grid-cols-[1fr_auto] gap-2">
                          <Input
                            id="interval"
                            type="number"
                            step="1"
                            min="1"
                            value={cur.value}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              if (Number.isFinite(v) && v >= 0) {
                                const newSec = toSeconds(v, intervalUnit);
                                field.onChange(newSec);
                                setValue(
                                  "policy.fundingStt" as never,
                                  suggestedFundingStt(values.durationSec, newSec) as never,
                                );
                              }
                            }}
                            error={fieldState.error?.message}
                            className="font-numeric"
                          />
                          <Select
                            value={intervalUnit}
                            onChange={(e) => {
                              const u = e.target.value as Unit;
                              setIntervalUnit(u);
                              const newSec = toSeconds(cur.value, u);
                              field.onChange(newSec);
                              setValue(
                                "policy.fundingStt" as never,
                                suggestedFundingStt(values.durationSec, newSec) as never,
                              );
                            }}
                            className="w-32"
                          >
                            <option value="minutes">minutes</option>
                            <option value="hours">hours</option>
                            <option value="days">days</option>
                            <option value="weeks">weeks</option>
                          </Select>
                        </div>
                        <FieldError error={fieldState.error?.message} />
                      </div>
                    );
                  }}
                />
                <Controller
                  control={control}
                  name="policy.windowDays"
                  render={({ field, fieldState }) => (
                    <div className="space-y-1.5">
                      <Label htmlFor="window">Look back (days)</Label>
                      <Input
                        id="window"
                        type="number"
                        step="1"
                        min="1"
                        max="90"
                        value={Number.isFinite(field.value) ? field.value : ""}
                        onChange={(e) => field.onChange(intFromInput(e.target.value))}
                        onBlur={field.onBlur}
                        error={fieldState.error?.message}
                        className="font-numeric"
                      />
                      <FieldError error={fieldState.error?.message} />
                    </div>
                  )}
                />
              </div>

              <Controller
                control={control}
                name="policy.fundingStt"
                render={({ field, fieldState }) => (
                  <div className="space-y-1.5">
                    <Label htmlFor="funding">Upfront agent funding</Label>
                    <div className="relative">
                      <Input
                        id="funding"
                        type="number"
                        step="0.01"
                        min={CYCLE_COST_STT}
                        value={Number.isFinite(field.value) ? field.value : ""}
                        onChange={(e) => field.onChange(numFromInput(e.target.value))}
                        onBlur={field.onBlur}
                        error={fieldState.error?.message}
                        className="pr-14 font-numeric"
                      />
                      <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
                        STT
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Covers ~
                      <span className="font-mono">
                        {Math.floor((Number(field.value) || 0) / CYCLE_COST_STT)}
                      </span>{" "}
                      cycle{Math.floor((Number(field.value) || 0) / CYCLE_COST_STT) === 1 ? "" : "s"} ·
                      0.36 STT each. Top up later from the dashboard.
                    </p>
                    <FieldError error={fieldState.error?.message} />
                  </div>
                )}
              />

              <AggregatorPreview
                username={values.policy.enabled ? values.policy.githubUsername : ""}
                repo={values.policy.enabled ? values.policy.githubRepo : ""}
                windowDays={values.policy.enabled ? values.policy.windowDays : 7}
              />
            </div>
          )}

          <StepActions
            onBack={() => setStep(1)}
            onNext={goNext}
          />
        </Card>
      )}

      {/* ============ STEP 3 — REVIEW ============ */}
      {step === 3 && (
        <Card className="p-5 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Step 3 · Review
          </p>
          <h2 className="mt-1.5 text-xl font-semibold tracking-tight sm:text-2xl">
            Confirm the details.
          </h2>

          <dl className="mt-6 divide-y divide-border rounded-2xl border border-border">
            <ReviewRow label="Recipient" value={values.recipient} mono />
            <ReviewRow label="Amount" value={`${Number(values.amountStt).toLocaleString()} STT`} />
            <ReviewRow
              label="Duration"
              value={(() => {
                const f = fromSeconds(values.durationSec);
                return `${f.value} ${f.unit}`;
              })()}
            />
            <ReviewRow
              label="Policy"
              value={
                values.policy.enabled ? (
                  <Badge variant="active" className="gap-1.5">
                    On
                  </Badge>
                ) : (
                  <Badge variant="secondary">Off</Badge>
                )
              }
            />
            {values.policy.enabled && (
              <>
                <ReviewRow
                  label="Watching"
                  value={
                    <span className="font-mono text-xs">
                      {values.policy.githubUsername}/{values.policy.githubRepo}
                    </span>
                  }
                />
                <ReviewRow
                  label="Check interval"
                  value={(() => {
                    const f = fromSeconds(values.policy.checkIntervalSec);
                    return `${f.value} ${f.unit}`;
                  })()}
                />
                <ReviewRow label="Window" value={`${values.policy.windowDays} days`} />
              </>
            )}
          </dl>

          <div className="mt-5">
            <CostBreakdownPanel breakdown={cost} />
          </div>

          {/* Submission progress */}
          {phase !== "idle" && (
            <Card className="mt-5 p-4">
              <PhaseStep
                label="Submit createStream"
                state={phaseState("submitting-create", "confirming-create", phase, "create-failed")}
                hash={createTxHash}
              />
              <PhaseStep
                label="Confirm createStream"
                state={phaseState("confirming-create", "submitting-policy", phase, "create-failed", "done")}
                hash={createTxHash}
                subtle
              />
              {values.policy.enabled && (
                <>
                  <PhaseStep
                    label="Submit registerPolicy"
                    state={phaseState(
                      "submitting-policy",
                      "confirming-policy",
                      phase,
                      "policy-failed",
                    )}
                    hash={policyTxHash}
                  />
                  <PhaseStep
                    label="Confirm registerPolicy"
                    state={phaseState("confirming-policy", "done", phase, "policy-failed")}
                    hash={policyTxHash}
                    subtle
                  />
                </>
              )}
              <PhaseStep
                label={`Navigate to /streams/${createdStreamId?.toString() ?? "…"}`}
                state={phase === "done" ? "active" : "pending"}
                subtle
              />
              {submitError && (
                <div className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                  {submitError}
                  {createdStreamId && phase === "policy-failed" && (
                    <p className="mt-1.5 text-foreground/70">
                      Stream #{createdStreamId.toString()} exists.{" "}
                      <a
                        className="font-medium text-primary hover:underline"
                        href={`/streams/${createdStreamId.toString()}`}
                      >
                        Open it
                      </a>{" "}
                      to retry registering the policy from there.
                    </p>
                  )}
                </div>
              )}
            </Card>
          )}

          <StepActions
            onBack={() => setStep(2)}
            disabled={phase !== "idle" && phase !== "create-failed" && phase !== "policy-failed"}
            primary={
              <Button
                size="lg"
                onClick={submit}
                disabled={
                  !formState.isValid ||
                  (phase !== "idle" && phase !== "create-failed" && phase !== "policy-failed")
                }
                className="w-full gap-2 sm:w-auto"
              >
                {phase !== "idle" && phase !== "create-failed" && phase !== "policy-failed" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {phase === "done" ? "Done" : "Create stream"}
              </Button>
            }
          />
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Small inline components                                              */
/* ------------------------------------------------------------------ */

function StepActions({
  onBack,
  onNext,
  disabled,
  primary,
}: {
  onBack?: () => void;
  onNext?: () => void;
  disabled?: boolean;
  primary?: React.ReactNode;
}) {
  return (
    <div className="mt-7 flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
      {onBack ? (
        <Button variant="ghost" onClick={onBack} className="gap-1.5" disabled={disabled}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      ) : (
        <span />
      )}
      {primary ??
        (onNext ? (
          <Button onClick={onNext} className="gap-1.5">
            Next
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : null)}
    </div>
  );
}

function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="text-[11px] font-medium text-destructive">{error}</p>;
}

/** Parse a number input value. Returns NaN for empty/invalid so zod's
 *  numeric validators trigger the right error. */
function numFromInput(v: string): number {
  if (v === "") return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}
function intFromInput(v: string): number {
  if (v === "") return NaN;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : NaN;
}

function ReviewRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "break-all text-sm text-foreground/85",
          mono && "font-mono"
        )}
      >
        {value}
      </dd>
    </div>
  );
}

type PhaseStepState = "pending" | "active" | "done" | "error";

function phaseState(
  myActive: string,
  myDone: string,
  current: string,
  errorState: string,
  alsoDone?: string,
): PhaseStepState {
  if (current === errorState) return "pending";
  if (current === myActive) return "active";
  if (current === myDone || current === alsoDone || current === "done") return "done";
  return "pending";
}

function PhaseStep({
  label,
  state,
  hash,
  subtle,
}: {
  label: string;
  state: PhaseStepState;
  hash?: `0x${string}` | null;
  subtle?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span aria-hidden className="flex h-5 w-5 items-center justify-center">
        {state === "active" && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
        {state === "done" && <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
        {state === "pending" && (
          <span className={cn("h-1.5 w-1.5 rounded-full", subtle ? "bg-muted-foreground/30" : "bg-muted-foreground/50")} />
        )}
        {state === "error" && <span className="h-1.5 w-1.5 rounded-full bg-destructive" />}
      </span>
      <span
        className={cn(
          "flex-1 text-sm",
          state === "done" ? "text-foreground/85" : "text-foreground",
          state === "pending" && "text-muted-foreground",
        )}
      >
        {label}
      </span>
      {hash && state !== "pending" && (
        <a
          href={`https://shannon-explorer.somnia.network/tx/${hash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          {hash.slice(0, 8)}…
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
