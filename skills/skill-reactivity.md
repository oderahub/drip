# skill-reactivity.md — Somnia Reactivity patterns

**Read this before writing any code that uses Somnia Reactivity (subscriptions, handlers, scheduled events).**

This file is built directly from the official Somnia Reactivity documentation (`docs.somnia.network/developer/reactivity/reactivity-onchain` and tutorials). Where doc gaps exist, the gap is flagged with TODO and we use the most conservative interpretation.

---

## What Reactivity is

On-chain Reactivity lets a smart contract react to events in the same block, without anyone sending an event-handling transaction. A subscription is created by calling the reactivity precompile; the subscription persists in chain state; when an event log or system event matches the subscription's filter, validators include a synthetic transaction in the block that calls the subscription's handler contract. The owner of the subscription pays the gas.

This is the mechanism Drip uses for autonomous policy checks — the chain itself wakes Drip up on schedule, without any off-chain keeper.

## Critical constants

| Constant | Value |
|---|---|
| Reactivity precompile address | `0x0100` |
| System events emitter | `0x100` |
| Subscription owner minimum balance | `32` native tokens (STT on testnet, SOMI on mainnet) |
| Minimum base fee per gas | `6` gwei (6,000,000,000 wei) |
| Maximum handler gas limit | `200,000,000` |
| Subscription creation gas cost | `210,000` gas |
| Block time | ~100 ms |
| Epoch length | ~5 minutes |

## Critical rule: 32 native tokens minimum balance

The subscription owner must hold ≥ 32 native tokens at the moment `subscribe` is called. **For Drip, the owner is the Drip contract itself** (because the constructor calls `subscribe` from `address(this)`). This means **Drip must be deployed with at least 33 STT funded into it**.

The 32 STT is not consumed and not escrowed — it sits in the contract's balance and is sybil protection. Once the subscription is active, gas for each handler invocation is paid from the contract's balance at the normal per-tx rate.

⚠️ The 32 STT threshold is only enforced at creation. A subscription continues to fire after the owner's balance drops below 32 STT, as long as the owner can still pay gas per invocation. If the owner can't pay, the subscription is automatically removed.

## The Solidity package: `@somnia-chain/reactivity-contracts`

Install:

```bash
npm install @somnia-chain/reactivity-contracts
```

Three pieces matter for Drip:

### 1. `SomniaEventHandler` — abstract base contract

Inherit from this. It implements the "only the reactivity precompile may call me" check on `onEvent`. Override the protected `_onEvent` hook.

```solidity
import {SomniaEventHandler} from "@somnia-chain/reactivity-contracts/contracts/SomniaEventHandler.sol";

contract MyHandler is SomniaEventHandler {
    function _onEvent(
        address emitter,
        bytes32[] calldata eventTopics,
        bytes calldata data
    ) internal override {
        // react to the event here
    }
}
```

### 2. `SomniaExtensions` — ergonomic helper library

The main API surface. Internal functions called from inside a Solidity contract.

Key functions:

| Function | Purpose |
|---|---|
| `subscribe(handler, filter, options)` | Create a custom subscription with a filter |
| `scheduleSubscriptionAtTimestamp(handler, timestampMillis, options)` | One-shot Schedule subscription firing at a future ms timestamp |
| `scheduleSubscriptionAtBlock(handler, blockNumber, options)` | One-shot BlockTick subscription firing at a specific block |
| `scheduleSubscriptionAtEpoch(handler, epochNumber, options)` | One-shot EpochTick subscription firing at end of epoch |
| `unsubscribe(subscriptionId)` | Cancel a subscription owned by the caller |
| `getSubscriptionInfo(subscriptionId)` | Read stored parameters of a subscription |

Helper structs:

```solidity
struct SubscriptionFilter {
    bytes32[4] eventTopics;
    address origin;
    address emitter;
}

struct SubscriptionOptions {
    uint64 priorityFeePerGas;
    uint64 maxFeePerGas;
    uint64 gasLimit;
}
```

### 3. `ISomniaReactivityPrecompile` — raw precompile interface

Provides the canonical event signatures used as topic hashes:
- `ISomniaReactivityPrecompile.BlockTick.selector`
- `ISomniaReactivityPrecompile.EpochTick.selector`
- `ISomniaReactivityPrecompile.Schedule.selector`

## The three system events

System events are synthetic logs from the reactivity precompile at `0x100`. To subscribe to one, set the SubscriptionFilter as follows:

| Event | `emitter` | `eventTopics[0]` | `eventTopics[1]` | When it fires |
|---|---|---|---|---|
| BlockTick | `0x100` | `keccak256("BlockTick(uint64)")` | block number (or 0) | Every block (~100ms) if topic[1] is 0, else once at that block |
| EpochTick | `0x100` | `keccak256("EpochTick(uint64,uint64)")` | epoch number (or 0) | End of every epoch (~5min) if topic[1] is 0, else end of that epoch |
| Schedule | `0x100` | `keccak256("Schedule(uint256)")` | timestamp in ms | Once, in the first block whose timestamp ≥ topic[1] |

**Scheduled timestamps must be strictly greater than the current block timestamp** at subscription creation.

**Block-specific BlockTick, epoch-specific EpochTick, and Schedule are all one-shot** — the subscription is automatically removed after it fires.

Every-block and every-epoch subscriptions are recurring.

## The Drip pattern: self-rescheduling Schedule subscriptions

For periodic policy checks (Drip's use case), the right pattern is **chained one-shot Schedule subscriptions**, not a recurring BlockTick.

### Why not recurring BlockTick

A recurring BlockTick fires every block (~10x per second). Even with internal "only run every N days" logic in the handler, you're paying gas every block to check whether it's time to act. Wasteful and noisy.

### The chain pattern

1. **Stream creation** — when `createStream` is called, schedule the first policy check:

```solidity
uint256 firstCheckMs = (block.timestamp + policy.checkIntervalSeconds) * 1000;
uint256 subId = SomniaExtensions.scheduleSubscriptionAtTimestamp(
    address(this),
    firstCheckMs,
    SomniaExtensions.SubscriptionOptions({
        priorityFeePerGas: 1,
        maxFeePerGas: 0,
        gasLimit: 2_000_000
    })
);
stream.activeSubscriptionId = subId;
```

2. **Handler fires** — when the scheduled time is reached, the reactivity precompile calls `onEvent` on Drip. The base contract verifies the caller is `0x0100` and then calls our `_onEvent`. Inside `_onEvent`, we identify which stream needs checking (from a mapping or by decoding `data`), then invoke the agents to fetch and classify GitHub activity.

3. **Agent callback fires** — when the agent subcommittee returns the classification, our agent-callback handler (different from the reactivity handler) acts on the result:
   - If `active`: ensure stream is running, schedule next check
   - If `dormant`: pause the stream, schedule next check (so we can detect resumption)
   - If `inconclusive`: no state change, schedule next check

The handler always schedules the next check, creating a self-perpetuating chain per stream.

4. **Stream cancellation / completion** — when a stream ends or is cancelled, we don't need to actively unsubscribe (the next scheduled subscription will fire once and then auto-remove because it's one-shot). But if you want to be tidy and stop the chain immediately, store the current `subscriptionId` and call `SomniaExtensions.unsubscribe(subscriptionId)`.

## SubscriptionOptions sizing — defaults for Drip

```solidity
SomniaExtensions.SubscriptionOptions({
    priorityFeePerGas: 1,           // wei. Low because Drip is the only thing in our subscription queue.
    maxFeePerGas: 0,                // 0 = protocol picks the max (use with caution; can fail if gas spikes)
    gasLimit: 2_000_000             // 2M gas — enough for the _onEvent body that invokes the agent
})
```

### Gas limit reasoning

The Somnia docs explicitly warn that Somnia storage operations require a **1,000,000 gas reserve** for disk reads / new storage allocation. So 2M gas leaves 1M for actual handler work, which is more than enough for our `_onEvent` body (it just decodes data and calls `platform.createRequest`).

If you find handlers reverting with OOG, increase to 3-5M. Max is 200M.

### Fee units gotcha

⚠️ `priorityFeePerGas` and `maxFeePerGas` are denominated in **wei**, but Somnia's minimum base fee is **6 gwei (6,000,000,000 wei)**. A common mistake is to specify a fee in wei thinking the unit is gwei. **Don't.**

For Drip's pattern, `priorityFeePerGas: 1` (1 wei) plus the protocol's automatic `maxFeePerGas` is fine. The base fee gets added by the protocol.

## Handler execution context

Inside `_onEvent`:

- `msg.sender == 0x0100` (the reactivity precompile)
- `tx.origin == subscription owner address` (Drip itself)
- `msg.value == 0` (reactive calls never carry value)
- Calldata args = (address emitter, bytes32[] eventTopics, bytes data) from the matching log

For a Schedule subscription firing:
- `emitter == 0x100`
- `eventTopics[0] == keccak256("Schedule(uint256)")`
- `eventTopics[1] == timestamp in ms` (the scheduled time)
- `data` is empty

To know **which stream** to check, encode the stream ID into the Schedule subscription's filter or maintain a `mapping(uint256 subscriptionId => uint256 streamId)`. Drip uses the latter for clarity.

## Automatic removal — when subscriptions die

A subscription is automatically removed when:
1. It's a one-shot scheduled subscription and it has just fired.
2. It was evicted from a full reactivity queue and was one-shot.
3. The owner's balance can't cover `(execution price per gas + priorityFeePerGas) × gasLimit` when it fires.

A subscription is **not** removed when:
- The handler reverts.
- The handler exceeds gasLimit.
- Owner's balance drops below 32 SOMI but is still enough to pay individual invocations.
- The handler is deferred due to queue pressure.

**Implication for Drip**: as long as Drip's balance stays high enough to pay handler gas (very cheap — a few hundredths of an STT per invocation), subscriptions perpetuate forever. The contract should have a top-up function and/or accept payments that route into a treasury for future gas.

## Filter semantics

A subscription matches an event log when **every non-zero filter field equals the corresponding field on the log**. Zero acts as a wildcard. At least one field must be non-zero (no fully-wildcard subscriptions allowed).

Topic filters are positional — `eventTopics[0]` matches the log's first topic (event signature), `eventTopics[1]` matches the second, etc.

There is no OR support on a single field. For disjunctive matching, create multiple subscriptions.

## Common pitfalls

1. **Recursive subscription explosion** — if a handler emits a log that matches its own subscription, you get an unstoppable feedback loop draining the owner's balance. Always check that handlers don't emit events matching their own filter.

2. **gasLimit too low** — Somnia storage costs more gas than Ethereum. Always leave at least 1M gas reserve.

3. **maxFeePerGas in wei vs gwei** — see above. Common mistake.

4. **Subscription points at concrete contract address** — if you redeploy the handler, you must create a new subscription. Old ones point at the old contract.

5. **Only successful transaction logs trigger reactivity** — if the triggering transaction reverts, its logs don't match subscriptions.

6. **Reactive transactions are separate transactions** — they're not callbacks within the triggering tx. Code accordingly. A reactive tx running after a triggering tx may see modified state.

## RPC methods for inspection

- `somnia_reactivityGetSubscriptionInfo(id)` — returns details of one subscription
- `somnia_reactivityGetSubscriptions(owner)` — returns all subscriptions for an owner address

Useful for debugging "why isn't my handler firing?" — first thing to check is whether the subscription is still active.

## Identifying reactive transactions in block history

Reactive transactions are legacy-typed (type `0x0`) with nonces that pack `(blockNumber << 24) | queuePosition`. The first reactive in block `0xabcdef` has nonce `0xabcdef000000`. Useful for diagnosing reactivity behavior in block explorers.

## TypeScript SDK (for off-chain / EOA owners)

The `@somnia-chain/reactivity` package provides a Viem-based SDK. Drip does NOT use this from contracts (contracts use `SomniaExtensions` directly), but the SDK is useful for:
- Inspecting Drip's active subscriptions from a script
- Cancelling subscriptions from off-chain orchestration
- WebSocket-based off-chain reactivity (not used in Drip)

## Reference: minimal recurring every-block subscription

For completeness, here's how to subscribe to every block (not what Drip uses, but a useful reference):

```solidity
SomniaExtensions.SubscriptionFilter memory filter =
    SomniaExtensions.SubscriptionFilter({
        eventTopics: [
            ISomniaReactivityPrecompile.BlockTick.selector,
            bytes32(0), bytes32(0), bytes32(0)   // wildcard block number = recurring
        ],
        origin: address(0),
        emitter: SomniaExtensions.SOMNIA_REACTIVITY_PRECOMPILE_ADDRESS
    });

uint256 subscriptionId = SomniaExtensions.subscribe(
    address(this), filter, options
);
```

## Drip's specific Reactivity invariants

These are decisions specific to Drip that should never be violated:

1. **One subscription per active stream.** Each stream's policy check chain is independent. Cancelling a stream cancels its chain.

2. **Use Schedule subscriptions, not BlockTick.** Drip never wants every-block triggering.

3. **The Drip contract is always the subscription owner.** Never let an EOA own a Drip-related subscription — the contract should be self-contained.

4. **Always re-schedule from inside the agent callback, not from `_onEvent`.** If `_onEvent` directly re-schedules, you get the next check before the current agent invocation has finished. Re-schedule only after we know the policy outcome.

5. **gasLimit of 2,000,000 is the default**, increase only if specific operations require it.

6. **Drip's balance must never fall below ~32 STT** in normal operation, so the 32 STT minimum holds for any future re-subscription. Code defensively.
