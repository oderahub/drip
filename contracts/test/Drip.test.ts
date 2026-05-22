/**
 * Drip.test.ts — streaming-primitive tests
 *
 * Scope: pure streaming math + lifecycle (Milestone 2). Does NOT touch the
 * reactivity handler hook (Milestone 3) or DripPolicies (separate file).
 *
 * Run with:
 *   npx hardhat test test/Drip.test.ts
 */

import hre from "hardhat";
import { expect } from "chai";
import { parseEther, getAddress, type Address } from "viem";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

// Funding for the Drip contract at deploy — satisfies the 32 STT reactivity
// reserve. We use 40 STT so we have a small buffer above the reserve for the
// solvency assertions to be meaningful.
const DRIP_FUNDING = parseEther("40");

// Standard stream parameters used across most tests. 1 STT over 100s gives a
// clean rate of 0.01 STT/sec and durations that are cheap to advance.
const STREAM_AMOUNT = parseEther("1");
const STREAM_DURATION = 100n; // seconds
const RATE_PER_SECOND = STREAM_AMOUNT / STREAM_DURATION; // 0.01 STT/sec

async function deployDripFixture() {
  const [deployer, sender, recipient, policies, stranger] =
    await hre.viem.getWalletClients();
  const publicClient = await hre.viem.getPublicClient();

  const drip = await hre.viem.deployContract("Drip", [], {
    value: DRIP_FUNDING,
  });

  // Wire policies (mocked: just a plain EOA the tests can call pause/resume from)
  await drip.write.setPolicies([policies.account.address]);

  return { drip, deployer, sender, recipient, policies, stranger, publicClient };
}

// Helper: createStream from `sender`, return the streamId
async function createStream(
  drip: any,
  sender: any,
  recipient: Address,
  amount: bigint = STREAM_AMOUNT,
  duration: bigint = STREAM_DURATION
): Promise<bigint> {
  const streamId = await drip.read.nextStreamId();
  await drip.write.createStream([recipient, duration], {
    value: amount,
    account: sender.account,
  });
  return streamId;
}

// Helper: read a Stream struct out of the public mapping
async function readStream(drip: any, streamId: bigint) {
  const result = (await drip.read.streams([streamId])) as readonly [
    Address, // sender
    Address, // recipient
    bigint,  // totalAmount
    bigint,  // ratePerSecond
    bigint,  // startTime
    bigint,  // endTime
    bigint,  // withdrawn
    bigint,  // pausedAt
    bigint,  // pausedAccumulated
    number   // status
  ];
  return {
    sender: result[0],
    recipient: result[1],
    totalAmount: result[2],
    ratePerSecond: result[3],
    startTime: result[4],
    endTime: result[5],
    withdrawn: result[6],
    pausedAt: result[7],
    pausedAccumulated: result[8],
    status: result[9],
  };
}

const STATUS = {
  None: 0,
  Active: 1,
  Paused: 2,
  Cancelled: 3,
  Completed: 4,
} as const;

const MAX_U256 = (1n << 256n) - 1n;

// Custom-error selectors (4-byte). viem usually decodes these into the error
// name in the message, but for some calls it reports an "unrecognized custom
// error" and only includes the raw selector. We assert against both forms so
// the test is robust to viem's decoding quirks.
const ERR = {
  NotPolicies: "6d3e5063",
  InvalidStream: "a0f87d33",
  NoPoliciesWired: "1e0ccffc",
  UnknownSubscriptionTimestamp: "8746a4d9",
  ScheduleInPast: "fbcd5340",
} as const;

/** Run `op` and assert it rejects with either the named custom error or its selector. */
async function expectRevertWith(op: Promise<unknown>, name: string, selector?: string) {
  let threw = false;
  let msg = "";
  try {
    await op;
  } catch (err) {
    threw = true;
    const e = err as any;
    msg = `${e.message ?? ""} | ${e.details ?? ""} | ${e.cause?.message ?? ""}`;
  }
  expect(threw, "expected promise to reject").to.be.true;
  const hit = msg.includes(name) || (selector !== undefined && msg.includes(selector));
  expect(hit, `expected revert to mention "${name}" or selector "${selector}"; got: ${msg.slice(0, 300)}`).to.be.true;
}

// ─────────────────────────────────────────────────────────────────────────────
//  _availableBalance
// ─────────────────────────────────────────────────────────────────────────────

describe("Drip._availableBalance (via availableBalance view)", () => {
  it("returns 0 immediately at stream creation", async () => {
    const { drip, sender, recipient } = await loadFixture(deployDripFixture);
    const id = await createStream(drip, sender, recipient.account.address);
    expect(await drip.read.availableBalance([id])).to.equal(0n);
  });

  it("returns ratePerSecond * elapsed mid-stream (active)", async () => {
    const { drip, sender, recipient } = await loadFixture(deployDripFixture);
    const id = await createStream(drip, sender, recipient.account.address);
    await time.increase(50);
    // 50 seconds * 0.01 STT/s = 0.5 STT
    expect(await drip.read.availableBalance([id])).to.equal(50n * RATE_PER_SECOND);
  });

  it("caps at maxAccruable past endTime", async () => {
    const { drip, sender, recipient } = await loadFixture(deployDripFixture);
    const id = await createStream(drip, sender, recipient.account.address);
    await time.increase(500); // well past endTime (100s)
    expect(await drip.read.availableBalance([id])).to.equal(
      STREAM_DURATION * RATE_PER_SECOND
    );
  });

  it("excludes the active (currently-paused) portion of time", async () => {
    const { drip, sender, recipient, policies } = await loadFixture(deployDripFixture);
    const id = await createStream(drip, sender, recipient.account.address);
    await time.increase(30); // 30s accrued
    await drip.write.pause([id, "test pause"], { account: policies.account });
    const balAtPause = await drip.read.availableBalance([id]);
    await time.increase(40); // 40s of paused time — should not accrue
    const balLater = await drip.read.availableBalance([id]);
    // No accrual during pause.
    expect(balLater).to.equal(balAtPause);
    // Pre-pause accrual ~30s. Tolerance ±2s for the pause tx itself advancing
    // the timestamp.
    const lo = 29n * RATE_PER_SECOND;
    const hi = 32n * RATE_PER_SECOND;
    expect(
      balAtPause >= lo && balAtPause <= hi,
      `balAtPause=${balAtPause} outside [${lo}, ${hi}]`
    ).to.be.true;
  });

  it("excludes pausedAccumulated after a completed pause cycle", async () => {
    const { drip, sender, recipient, policies } = await loadFixture(deployDripFixture);
    const id = await createStream(drip, sender, recipient.account.address);
    await time.increase(20);
    await drip.write.pause([id, "p1"], { account: policies.account });
    await time.increase(50);
    await drip.write.resume([id], { account: policies.account });
    // Now: 20s active + 50s paused + (about to advance) 30s active = 50s effective
    await time.increase(30);
    const bal = await drip.read.availableBalance([id]);
    // Tolerance ±4s for pause/resume tx timestamp drift (each tx advances ~1s).
    const lo = 46n * RATE_PER_SECOND;
    const hi = 54n * RATE_PER_SECOND;
    expect(bal >= lo && bal <= hi, `bal=${bal} outside [${lo}, ${hi}]`).to.be.true;
  });

  it("returns 0 for status None (unset streamId)", async () => {
    const { drip } = await loadFixture(deployDripFixture);
    expect(await drip.read.availableBalance([9999n])).to.equal(0n);
  });

  it("returns 0 after cancel", async () => {
    const { drip, sender, recipient } = await loadFixture(deployDripFixture);
    const id = await createStream(drip, sender, recipient.account.address);
    await time.increase(30);
    await drip.write.cancel([id], { account: sender.account });
    expect(await drip.read.availableBalance([id])).to.equal(0n);
  });

  it("caps pausedSpan at totalSpan (pause extending past endTime)", async () => {
    const { drip, sender, recipient, policies } = await loadFixture(deployDripFixture);
    const id = await createStream(drip, sender, recipient.account.address);
    await time.increase(10);
    await drip.write.pause([id, "long pause"], { account: policies.account });
    // Pause for way longer than the stream duration. effective should clamp to 10s.
    await time.increase(500);
    await drip.write.resume([id], { account: policies.account });
    // After resume, well past endTime. Available = ratePerSecond * (active time
    // ≤ 10s). Tolerance ±3s for tx-mined timestamp drift.
    const bal = await drip.read.availableBalance([id]);
    expect(bal <= 13n * RATE_PER_SECOND, `bal=${bal} exceeds clamped max`).to.be.true;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  createStream
// ─────────────────────────────────────────────────────────────────────────────

describe("Drip.createStream", () => {
  it("creates a stream and emits StreamCreated", async () => {
    const { drip, sender, recipient, publicClient } = await loadFixture(deployDripFixture);
    const hash = await drip.write.createStream(
      [recipient.account.address, STREAM_DURATION],
      { value: STREAM_AMOUNT, account: sender.account }
    );
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const events = await drip.getEvents.StreamCreated();
    expect(events.length).to.be.greaterThan(0);
    const e = events[events.length - 1];
    expect(e.args.streamId).to.equal(1n);
    expect(getAddress(e.args.sender!)).to.equal(getAddress(sender.account.address));
    expect(getAddress(e.args.recipient!)).to.equal(getAddress(recipient.account.address));
    expect(e.args.totalAmount).to.equal(STREAM_AMOUNT);
    expect(e.args.ratePerSecond).to.equal(RATE_PER_SECOND);
    expect(receipt.status).to.equal("success");
  });

  it("computes ratePerSecond as totalAmount / durationSeconds", async () => {
    const { drip, sender, recipient } = await loadFixture(deployDripFixture);
    const id = await createStream(
      drip,
      sender,
      recipient.account.address,
      parseEther("3"),
      300n
    );
    const s = await readStream(drip, id);
    expect(s.ratePerSecond).to.equal(parseEther("3") / 300n);
  });

  it("auto-increments stream IDs starting at 1", async () => {
    const { drip, sender, recipient } = await loadFixture(deployDripFixture);
    const id1 = await createStream(drip, sender, recipient.account.address);
    const id2 = await createStream(drip, sender, recipient.account.address);
    const id3 = await createStream(drip, sender, recipient.account.address);
    expect(id1).to.equal(1n);
    expect(id2).to.equal(2n);
    expect(id3).to.equal(3n);
  });

  it("sets status to Active", async () => {
    const { drip, sender, recipient } = await loadFixture(deployDripFixture);
    const id = await createStream(drip, sender, recipient.account.address);
    const s = await readStream(drip, id);
    expect(s.status).to.equal(STATUS.Active);
  });

  it("reverts on zero recipient", async () => {
    const { drip, sender } = await loadFixture(deployDripFixture);
    await expect(
      drip.write.createStream(
        ["0x0000000000000000000000000000000000000000", STREAM_DURATION],
        { value: STREAM_AMOUNT, account: sender.account }
      )
    ).to.be.rejectedWith(/InvalidRecipient/);
  });

  it("reverts on zero duration", async () => {
    const { drip, sender, recipient } = await loadFixture(deployDripFixture);
    await expect(
      drip.write.createStream([recipient.account.address, 0n], {
        value: STREAM_AMOUNT,
        account: sender.account,
      })
    ).to.be.rejectedWith(/InvalidDuration/);
  });

  it("reverts on zero msg.value", async () => {
    const { drip, sender, recipient } = await loadFixture(deployDripFixture);
    await expect(
      drip.write.createStream([recipient.account.address, STREAM_DURATION], {
        value: 0n,
        account: sender.account,
      })
    ).to.be.rejectedWith(/InvalidAmount/);
  });

  it("reverts when msg.value < durationSeconds (rate would be 0)", async () => {
    const { drip, sender, recipient } = await loadFixture(deployDripFixture);
    // 50 wei over 100 seconds → rate = 0
    await expect(
      drip.write.createStream([recipient.account.address, 100n], {
        value: 50n,
        account: sender.account,
      })
    ).to.be.rejectedWith(/InvalidAmount/);
  });

  it("totalCommittedUnreleased grows by ratePerSecond * duration", async () => {
    const { drip, sender, recipient } = await loadFixture(deployDripFixture);
    const before = await drip.read.totalCommittedUnreleased();
    await createStream(drip, sender, recipient.account.address);
    const after = await drip.read.totalCommittedUnreleased();
    expect(after - before).to.equal(RATE_PER_SECOND * STREAM_DURATION);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  withdraw
// ─────────────────────────────────────────────────────────────────────────────

describe("Drip.withdraw", () => {
  it("allows recipient to withdraw a partial amount", async () => {
    const { drip, sender, recipient, publicClient } = await loadFixture(deployDripFixture);
    const id = await createStream(drip, sender, recipient.account.address);
    await time.increase(40);
    const ask = 10n * RATE_PER_SECOND; // 10s worth
    const balBefore = await publicClient.getBalance({ address: recipient.account.address });
    const hash = await drip.write.withdraw([id, ask], { account: recipient.account });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const balAfter = await publicClient.getBalance({ address: recipient.account.address });
    const gasCost = receipt.gasUsed * receipt.effectiveGasPrice;
    expect(balAfter - balBefore + gasCost).to.equal(ask);
    const s = await readStream(drip, id);
    expect(s.withdrawn).to.equal(ask);
  });

  it("supports type(uint256).max to withdraw everything available", async () => {
    const { drip, sender, recipient, publicClient } = await loadFixture(deployDripFixture);
    const id = await createStream(drip, sender, recipient.account.address);
    await time.increase(50);
    const balBefore = await publicClient.getBalance({ address: recipient.account.address });
    const hash = await drip.write.withdraw([id, MAX_U256], { account: recipient.account });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const balAfter = await publicClient.getBalance({ address: recipient.account.address });
    const gasCost = receipt.gasUsed * receipt.effectiveGasPrice;
    // ~50s elapsed; tolerance ±2s
    const got = balAfter - balBefore + gasCost;
    expect(got >= 49n * RATE_PER_SECOND && got <= 52n * RATE_PER_SECOND).to.be.true;
  });

  it("caps an over-large explicit amount at availableBalance", async () => {
    const { drip, sender, recipient } = await loadFixture(deployDripFixture);
    const id = await createStream(drip, sender, recipient.account.address);
    await time.increase(20);
    const huge = parseEther("999");
    await drip.write.withdraw([id, huge], { account: recipient.account });
    const s = await readStream(drip, id);
    // Should have withdrawn ~20s worth, not 999 STT
    expect(s.withdrawn <= 25n * RATE_PER_SECOND).to.be.true;
  });

  it("rejects withdrawal by non-recipient", async () => {
    const { drip, sender, recipient, stranger } = await loadFixture(deployDripFixture);
    const id = await createStream(drip, sender, recipient.account.address);
    await time.increase(10);
    await expect(
      drip.write.withdraw([id, MAX_U256], { account: stranger.account })
    ).to.be.rejectedWith(/NotRecipient/);
  });

  it("reverts with NothingToWithdraw on a Cancelled stream (balance forced to 0)", async () => {
    // Hardhat advances the timestamp by 1s every tx, so a fresh stream always
    // has >0 accrual by the time withdraw lands. The reliable trigger for
    // _availableBalance == 0 is a Cancelled stream — which we use here.
    const { drip, sender, recipient } = await loadFixture(deployDripFixture);
    const id = await createStream(drip, sender, recipient.account.address);
    await time.increase(10);
    await drip.write.cancel([id], { account: sender.account });
    await expect(
      drip.write.withdraw([id, MAX_U256], { account: recipient.account })
    ).to.be.rejectedWith(/NothingToWithdraw/);
  });

  it("reverts on InvalidStream for non-existent id", async () => {
    const { drip, recipient } = await loadFixture(deployDripFixture);
    await expectRevertWith(
      drip.write.withdraw([9999n, MAX_U256], { account: recipient.account }),
      "InvalidStream",
      ERR.InvalidStream
    );
  });

  it("respects paused-time exclusion: cannot withdraw time spent paused", async () => {
    const { drip, sender, recipient, policies } = await loadFixture(deployDripFixture);
    const id = await createStream(drip, sender, recipient.account.address);
    await time.increase(20); // 20s active
    await drip.write.pause([id, "pp"], { account: policies.account });
    await time.increase(500); // 500s paused — should not accrue
    // Withdraw all available: should be capped near the 20s pre-pause accrual
    await drip.write.withdraw([id, MAX_U256], { account: recipient.account });
    const s = await readStream(drip, id);
    expect(s.withdrawn <= 25n * RATE_PER_SECOND).to.be.true;
  });

  it("transitions to Completed when fully withdrawn past endTime", async () => {
    const { drip, sender, recipient } = await loadFixture(deployDripFixture);
    const id = await createStream(drip, sender, recipient.account.address);
    await time.increase(Number(STREAM_DURATION) + 10);
    await drip.write.withdraw([id, MAX_U256], { account: recipient.account });
    const s = await readStream(drip, id);
    expect(s.status).to.equal(STATUS.Completed);
    expect(s.withdrawn).to.equal(RATE_PER_SECOND * STREAM_DURATION);
  });

  it("emits Withdrawal with the correct fields", async () => {
    const { drip, sender, recipient } = await loadFixture(deployDripFixture);
    const id = await createStream(drip, sender, recipient.account.address);
    await time.increase(40);
    await drip.write.withdraw([id, MAX_U256], { account: recipient.account });
    const events = await drip.getEvents.Withdrawal();
    const e = events[events.length - 1];
    expect(e.args.streamId).to.equal(id);
    expect(getAddress(e.args.recipient!)).to.equal(getAddress(recipient.account.address));
    expect((e.args.amount as bigint) > 0n).to.be.true;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  pause / resume
// ─────────────────────────────────────────────────────────────────────────────

describe("Drip.pause / resume", () => {
  it("only policies can pause", async () => {
    const { drip, sender, recipient, stranger } = await loadFixture(deployDripFixture);
    const id = await createStream(drip, sender, recipient.account.address);
    await expectRevertWith(
      drip.write.pause([id, "x"], { account: stranger.account }),
      "NotPolicies",
      ERR.NotPolicies
    );
  });

  it("only policies can resume", async () => {
    const { drip, sender, recipient, policies, stranger } = await loadFixture(deployDripFixture);
    const id = await createStream(drip, sender, recipient.account.address);
    await drip.write.pause([id, "x"], { account: policies.account });
    await expect(
      drip.write.resume([id], { account: stranger.account })
    ).to.be.rejectedWith(/NotPolicies/);
  });

  it("pause: reverts unless status is Active", async () => {
    const { drip, sender, recipient, policies } = await loadFixture(deployDripFixture);
    const id = await createStream(drip, sender, recipient.account.address);
    await drip.write.pause([id, "first"], { account: policies.account });
    // Already Paused — second pause should revert with InvalidStatus
    await expect(
      drip.write.pause([id, "second"], { account: policies.account })
    ).to.be.rejectedWith(/InvalidStatus/);
  });

  it("resume: reverts unless status is Paused", async () => {
    const { drip, sender, recipient, policies } = await loadFixture(deployDripFixture);
    const id = await createStream(drip, sender, recipient.account.address);
    // Active, not Paused — resume should revert
    await expect(
      drip.write.resume([id], { account: policies.account })
    ).to.be.rejectedWith(/InvalidStatus/);
  });

  it("pause transitions status to Paused and records pausedAt", async () => {
    const { drip, sender, recipient, policies } = await loadFixture(deployDripFixture);
    const id = await createStream(drip, sender, recipient.account.address);
    await time.increase(15);
    await drip.write.pause([id, "x"], { account: policies.account });
    const s = await readStream(drip, id);
    expect(s.status).to.equal(STATUS.Paused);
    expect(s.pausedAt > 0n).to.be.true;
  });

  it("resume clears pausedAt and accumulates duration", async () => {
    const { drip, sender, recipient, policies } = await loadFixture(deployDripFixture);
    const id = await createStream(drip, sender, recipient.account.address);
    await time.increase(10);
    await drip.write.pause([id, "x"], { account: policies.account });
    await time.increase(25);
    await drip.write.resume([id], { account: policies.account });
    const s = await readStream(drip, id);
    expect(s.status).to.equal(STATUS.Active);
    expect(s.pausedAt).to.equal(0n);
    // ±2s tolerance on pausedAccumulated
    expect(s.pausedAccumulated >= 24n && s.pausedAccumulated <= 27n).to.be.true;
  });

  it("accumulates paused time across multiple pause/resume cycles", async () => {
    const { drip, sender, recipient, policies } = await loadFixture(deployDripFixture);
    const id = await createStream(drip, sender, recipient.account.address);

    await time.increase(5);
    await drip.write.pause([id, "1"], { account: policies.account });
    await time.increase(10);
    await drip.write.resume([id], { account: policies.account });

    await time.increase(5);
    await drip.write.pause([id, "2"], { account: policies.account });
    await time.increase(15);
    await drip.write.resume([id], { account: policies.account });

    const s = await readStream(drip, id);
    // Total paused ~ 25s, tolerance ±4s
    expect(s.pausedAccumulated >= 23n && s.pausedAccumulated <= 28n).to.be.true;
  });

  it("recipient can still withdraw pre-pause accrual while paused", async () => {
    const { drip, sender, recipient, policies } = await loadFixture(deployDripFixture);
    const id = await createStream(drip, sender, recipient.account.address);
    await time.increase(30);
    await drip.write.pause([id, "x"], { account: policies.account });
    await time.increase(100);
    // Withdraw while paused — should pay the ~30s accrual
    await drip.write.withdraw([id, MAX_U256], { account: recipient.account });
    const s = await readStream(drip, id);
    expect(s.withdrawn >= 29n * RATE_PER_SECOND && s.withdrawn <= 32n * RATE_PER_SECOND)
      .to.be.true;
  });

  it("emits StreamPaused with the reason and StreamResumed", async () => {
    const { drip, sender, recipient, policies } = await loadFixture(deployDripFixture);
    const id = await createStream(drip, sender, recipient.account.address);
    await drip.write.pause([id, "dormant for 7d"], { account: policies.account });
    const pEvents = await drip.getEvents.StreamPaused();
    expect(pEvents[pEvents.length - 1].args.reason).to.equal("dormant for 7d");
    await drip.write.resume([id], { account: policies.account });
    const rEvents = await drip.getEvents.StreamResumed();
    expect(rEvents[rEvents.length - 1].args.streamId).to.equal(id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  cancel
// ─────────────────────────────────────────────────────────────────────────────

describe("Drip.cancel", () => {
  it("only the original sender can cancel", async () => {
    const { drip, sender, recipient, stranger } = await loadFixture(deployDripFixture);
    const id = await createStream(drip, sender, recipient.account.address);
    await expect(
      drip.write.cancel([id], { account: stranger.account })
    ).to.be.rejectedWith(/NotSender/);
  });

  it("cancel of Active: pays recipient accrued, refunds remainder to sender", async () => {
    const { drip, sender, recipient, publicClient } = await loadFixture(deployDripFixture);
    const id = await createStream(drip, sender, recipient.account.address);
    await time.increase(30);

    const senderBalBefore = await publicClient.getBalance({ address: sender.account.address });
    const recipBalBefore = await publicClient.getBalance({ address: recipient.account.address });

    const hash = await drip.write.cancel([id], { account: sender.account });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    const senderBalAfter = await publicClient.getBalance({ address: sender.account.address });
    const recipBalAfter = await publicClient.getBalance({ address: recipient.account.address });

    const gasCost = receipt.gasUsed * receipt.effectiveGasPrice;

    const recipientGot = recipBalAfter - recipBalBefore;
    const senderGot = senderBalAfter - senderBalBefore + gasCost;
    // Recipient ~ 30s of accrual, sender ~ 70s of refund + dust. Sum = 1 STT total.
    expect(recipientGot + senderGot).to.equal(STREAM_AMOUNT);
    expect(recipientGot >= 29n * RATE_PER_SECOND && recipientGot <= 32n * RATE_PER_SECOND)
      .to.be.true;
  });

  it("cancel of Paused: recipient gets only pre-pause accrual", async () => {
    const { drip, sender, recipient, policies, publicClient } = await loadFixture(deployDripFixture);
    const id = await createStream(drip, sender, recipient.account.address);
    await time.increase(20);
    await drip.write.pause([id, "x"], { account: policies.account });
    await time.increase(50); // these 50s should not be paid out

    const recipBalBefore = await publicClient.getBalance({ address: recipient.account.address });
    await drip.write.cancel([id], { account: sender.account });
    const recipBalAfter = await publicClient.getBalance({ address: recipient.account.address });

    const recipientGot = recipBalAfter - recipBalBefore;
    // ~20s of accrual ± 3s tolerance
    expect(recipientGot >= 19n * RATE_PER_SECOND && recipientGot <= 23n * RATE_PER_SECOND)
      .to.be.true;
  });

  it("status transitions to Cancelled", async () => {
    const { drip, sender, recipient } = await loadFixture(deployDripFixture);
    const id = await createStream(drip, sender, recipient.account.address);
    await time.increase(10);
    await drip.write.cancel([id], { account: sender.account });
    const s = await readStream(drip, id);
    expect(s.status).to.equal(STATUS.Cancelled);
  });

  it("cancel of already-Cancelled reverts", async () => {
    const { drip, sender, recipient } = await loadFixture(deployDripFixture);
    const id = await createStream(drip, sender, recipient.account.address);
    await drip.write.cancel([id], { account: sender.account });
    await expect(
      drip.write.cancel([id], { account: sender.account })
    ).to.be.rejectedWith(/InvalidStatus/);
  });

  it("cancel of Completed reverts", async () => {
    const { drip, sender, recipient } = await loadFixture(deployDripFixture);
    const id = await createStream(drip, sender, recipient.account.address);
    await time.increase(Number(STREAM_DURATION) + 10);
    await drip.write.withdraw([id, MAX_U256], { account: recipient.account });
    // Stream is now Completed
    await expect(
      drip.write.cancel([id], { account: sender.account })
    ).to.be.rejectedWith(/InvalidStatus/);
  });

  it("emits StreamCancelled", async () => {
    const { drip, sender, recipient } = await loadFixture(deployDripFixture);
    const id = await createStream(drip, sender, recipient.account.address);
    await drip.write.cancel([id], { account: sender.account });
    const events = await drip.getEvents.StreamCancelled();
    expect(events[events.length - 1].args.streamId).to.equal(id);
  });

  it("totalCommittedUnreleased drops to 0 after cancel of only stream", async () => {
    const { drip, sender, recipient } = await loadFixture(deployDripFixture);
    const id = await createStream(drip, sender, recipient.account.address);
    await time.increase(20);
    await drip.write.cancel([id], { account: sender.account });
    expect(await drip.read.totalCommittedUnreleased()).to.equal(0n);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  isSolvent / treasuryHealth
// ─────────────────────────────────────────────────────────────────────────────

describe("Drip.isSolvent and treasuryHealth", () => {
  it("solvent at deploy (just the 32 STT reserve held)", async () => {
    const { drip } = await loadFixture(deployDripFixture);
    expect(await drip.read.isSolvent()).to.be.true;
  });

  it("solvent after one createStream", async () => {
    const { drip, sender, recipient } = await loadFixture(deployDripFixture);
    await createStream(drip, sender, recipient.account.address);
    expect(await drip.read.isSolvent()).to.be.true;
  });

  it("solvent after many createStreams", async () => {
    const { drip, sender, recipient } = await loadFixture(deployDripFixture);
    for (let i = 0; i < 5; i++) {
      await createStream(drip, sender, recipient.account.address);
    }
    expect(await drip.read.isSolvent()).to.be.true;
  });

  it("solvent after a withdraw", async () => {
    const { drip, sender, recipient } = await loadFixture(deployDripFixture);
    const id = await createStream(drip, sender, recipient.account.address);
    await time.increase(40);
    await drip.write.withdraw([id, MAX_U256], { account: recipient.account });
    expect(await drip.read.isSolvent()).to.be.true;
  });

  it("solvent after a cancel", async () => {
    const { drip, sender, recipient } = await loadFixture(deployDripFixture);
    const id = await createStream(drip, sender, recipient.account.address);
    await time.increase(20);
    await drip.write.cancel([id], { account: sender.account });
    expect(await drip.read.isSolvent()).to.be.true;
  });

  it("solvent across pause/resume cycles", async () => {
    const { drip, sender, recipient, policies } = await loadFixture(deployDripFixture);
    const id = await createStream(drip, sender, recipient.account.address);
    await time.increase(10);
    await drip.write.pause([id, "x"], { account: policies.account });
    expect(await drip.read.isSolvent()).to.be.true;
    await time.increase(10);
    await drip.write.resume([id], { account: policies.account });
    expect(await drip.read.isSolvent()).to.be.true;
  });

  it("treasuryHealth surfaces sane fields", async () => {
    const { drip, sender, recipient } = await loadFixture(deployDripFixture);
    await createStream(drip, sender, recipient.account.address);
    const th = (await drip.read.treasuryHealth()) as {
      contractBalance: bigint;
      totalCommittedUnreleased: bigint;
      reactivityReserve: bigint;
      isHealthy: boolean;
    };
    expect(th.contractBalance).to.equal(DRIP_FUNDING + STREAM_AMOUNT);
    expect(th.totalCommittedUnreleased).to.equal(RATE_PER_SECOND * STREAM_DURATION);
    expect(th.reactivityReserve).to.equal(parseEther("32"));
    expect(th.isHealthy).to.equal(true);
  });
});
