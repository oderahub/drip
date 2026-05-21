/**
 * DripPolicies.test.ts
 *
 * Test plan for the DripPolicies agent-control layer.
 * Most of these tests will require mocking the platform contract since real
 * agent invocations cost STT and run asynchronously over multiple blocks.
 *
 * Run with:
 *   npx hardhat test
 */

import { describe, it } from "node:test";

describe("DripPolicies — policy registration", () => {
  it("registers a GitHub policy for a stream");
  it("emits PolicyRegistered with correct fields");
  it("schedules first policy check via Reactivity");
  it("emits PolicyCheckScheduled");
  it("rejects duplicate registration for the same stream");
});

describe("DripPolicies — policy check loop", () => {
  it("startPolicyCheck can only be called by Drip");
  it("startPolicyCheck invokes JSON API Request with correct payload");
  it("startPolicyCheck sends the correct deposit (floor + 0.03 × 3)");
  it("startPolicyCheck records pending request and phase = FetchingGithub");
  it("emits PolicyCheckStarted");
});

describe("DripPolicies — JSON API callback", () => {
  it("handleResponse can only be called by platform");
  it("handleResponse rejects unknown request IDs");
  it("on Success: decodes activity JSON and invokes LLM Inference");
  it("on Success: sends correct deposit for LLM Inference (floor + 0.07 × 3)");
  it("on Success: transitions phase to Classifying");
  it("on Failed: logs and schedules next check");
  it("on TimedOut: logs and schedules next check");
  it("emits GithubDataFetched");
});

describe("DripPolicies — LLM Inference callback", () => {
  it("on Success with 'active': resumes stream if paused");
  it("on Success with 'dormant': pauses stream if active");
  it("on Success with 'inconclusive': leaves stream state unchanged");
  it("on any verdict: schedules next policy check");
  it("on non-Success: schedules next check without state change");
  it("emits ClassificationReceived and PolicyActionTaken");
  it("updates policy.lastCheckTime and policy.activeSubscriptionId");
});

describe("DripPolicies — disable policy", () => {
  it("allows policy disable");
  it("unsubscribes the active subscription");
  it("rejects disable for unknown policy");
});
