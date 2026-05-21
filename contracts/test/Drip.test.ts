/**
 * Drip.test.ts
 *
 * Test plan for the Drip streaming primitive.
 * Tests are organized by lifecycle phase; implementations are TODO.
 *
 * Run with:
 *   npx hardhat test
 */

import { describe, it } from "node:test";

describe("Drip — stream creation", () => {
  it("creates a stream with valid parameters");
  it("emits StreamCreated with correct fields");
  it("computes ratePerSecond as totalAmount / durationSeconds");
  it("reverts on zero recipient");
  it("reverts on zero duration");
  it("reverts on zero msg.value");
  it("assigns auto-incrementing stream IDs starting at 1");
});

describe("Drip — withdrawal", () => {
  it("allows recipient to withdraw accrued balance");
  it("rejects withdrawal by non-recipient");
  it("rejects withdrawal exceeding available balance");
  it("updates withdrawn correctly");
  it("emits Withdrawal");
  it("supports type(uint256).max to withdraw all");
  it("respects paused-time exclusion in balance calculation");
});

describe("Drip — pause and resume", () => {
  it("allows DripPolicies to pause an active stream");
  it("rejects pause by non-policies caller");
  it("emits StreamPaused with reason");
  it("accumulates paused time correctly across multiple pause/resume cycles");
  it("recipient cannot withdraw time spent paused");
  it("allows DripPolicies to resume a paused stream");
  it("rejects resume of non-paused stream");
});

describe("Drip — cancellation", () => {
  it("allows sender to cancel a stream");
  it("refunds unstreamed portion to sender");
  it("pays recipient the accrued portion");
  it("rejects cancel by non-sender");
  it("rejects cancel of completed or already-cancelled stream");
  it("emits StreamCancelled");
});

describe("Drip — solvency invariant", () => {
  it("treasury health reflects committed + unreleased balances");
  it("isSolvent returns true after multiple streams created");
  it("isSolvent returns false if balance somehow drops below committed");
});

describe("Drip — reactivity handler", () => {
  it("_onEvent rejects calls from non-precompile");
  it("_onEvent decodes the firing subscription ID");
  it("_onEvent delegates to DripPolicies.startPolicyCheck");
});
