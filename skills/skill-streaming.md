# skill-streaming.md — Drip streaming architecture

**Read this before writing or modifying `Drip.sol` or `DripPolicies.sol`.**

This file encodes the architectural decisions specific to Drip's token streaming primitive.

---

## What Drip is

Drip is a token streaming protocol where each stream's flow rate is *autonomously controlled by an AI agent* via Somnia's on-chain primitives. It is not a generic Sablier port — the agent control is the entire point.

## The two contracts

### `Drip.sol` — the streaming primitive

Manages stream creation, balance accounting, withdrawal, pause/resume, cancellation. Inherits from `SomniaEventHandler` so the reactivity precompile can call it on scheduled policy checks.

### `DripPolicies.sol` — the agent-control layer

Holds per-stream policy configuration (GitHub repo, check interval, threshold). Coordinates agent invocation: receives the reactivity callback from `Drip.sol`, invokes JSON API Request to fetch GitHub data, invokes LLM Inference to classify, receives the classification, applies the action.

The split exists so the streaming primitive is independently reusable — anyone could write a different policy layer (price-based pausing, milestone verification, etc.) and bolt it onto the same streaming primitive.

For the hackathon, the split is logical only — both contracts can live in the same file and be deployed together if that's simpler. But the interfaces should respect the boundary.

## Stream data model

```solidity
enum StreamStatus {
    None,       // 0 — uninitialized
    Active,     // 1 — currently streaming
    Paused,     // 2 — temporarily paused by agent decision
    Cancelled,  // 3 — cancelled by sender, no further accrual
    Completed   // 4 — duration elapsed, ready for final withdrawal
}

struct Stream {
    address sender;
    address recipient;
    uint256 totalAmount;        // total to be streamed over the duration
    uint256 ratePerSecond;      // totalAmount / durationSeconds, scaled
    uint256 startTime;          // unix seconds
    uint256 endTime;            // unix seconds
    uint256 withdrawn;          // amount already withdrawn by recipient
    uint256 pausedAt;           // unix seconds, 0 if not currently paused
    uint256 pausedAccumulated;  // total seconds spent paused
    StreamStatus status;
}
```

## Stream math (Sablier-style with paused-time exclusion)

The available balance for a recipient is the amount that has accrued since stream start, minus paused time, minus what's already been withdrawn.

```
effectiveElapsedSeconds = min(now, endTime) - startTime - pausedAccumulated
                       - (currentlyPaused ? (now - pausedAt) : 0)

accruedAmount = ratePerSecond * effectiveElapsedSeconds

availableToWithdraw = accruedAmount - withdrawn
```

### Per-second rate calculation

```
ratePerSecond = totalAmount / durationSeconds
```

For native STT streams: integer division. The dust (rounding error) sits in the contract; sender can reclaim on cancellation or final withdrawal.

For ERC-20 streams later: same math, just denominated in token units.

### Critical invariant

**The contract must always be solvent**: contract balance ≥ sum of all unclaimed balances across all active streams. Test this invariant after every state-modifying operation.

## Lifecycle states and transitions

```
None ──createStream──▶ Active
Active ──pause──▶ Paused
Paused ──resume──▶ Active
Active ──cancel──▶ Cancelled
Paused ──cancel──▶ Cancelled
Active ──(now ≥ endTime)──▶ Completed
Paused ──(now ≥ endTime)──▶ Completed
```

Only `Active → Completed` happens automatically (lazy — on next withdraw or on the policy check). Everything else is triggered by a function call.

## Why pause/resume isn't simple

When a stream is paused:
- The recipient cannot withdraw the time spent paused (that's the point)
- But they can withdraw any time accrued *before* the pause

When the stream is resumed:
- We add to `pausedAccumulated` the duration of the pause we just exited
- The recipient resumes accruing balance

The implementation needs:
1. `pause()` records `pausedAt = block.timestamp` and sets status to Paused.
2. `resume()` adds `block.timestamp - pausedAt` to `pausedAccumulated`, clears `pausedAt`, sets status to Active.
3. `withdraw()` and balance views always check whether currently paused, and if so, subtract `(now - pausedAt)` from elapsed time in addition to `pausedAccumulated`.

## Policy data model

```solidity
struct Policy {
    uint256 streamId;
    bytes32 streamKey;              // identifier for the off-chain target
    string githubUsername;
    string githubRepo;
    uint256 checkIntervalSeconds;   // e.g. 7 days
    uint256 lastCheckTime;
    uint256 activeSubscriptionId;   // reactivity subscription ID for next check
}
```

For the hackathon demo, the policy is hardcoded to "GitHub activity check" with the standard three-way classifier. In production this would be pluggable (different policies for different streams).

## The policy-check loop (the agent-first heart of Drip)

This is the loop that makes Drip agent-native. It runs autonomously per stream.

```
[Scheduled subscription fires] ──reactivity──▶ Drip._onEvent
                                                    │
                                                    ▼
                                       Decode streamId from data
                                                    │
                                                    ▼
                                       DripPolicies.startCheck(streamId)
                                                    │
                                                    ▼
                                       Invoke JSON API Request agent
                                       (fetch GitHub activity JSON)
                                                    │
                                                    ▼
                                       [Async callback from JSON API agent]
                                                    │
                                                    ▼
                                       Invoke LLM Inference agent
                                       (classify as active/dormant/inconclusive)
                                                    │
                                                    ▼
                                       [Async callback from LLM agent]
                                                    │
                                                    ▼
                                       Apply action:
                                       - "active": ensure not paused
                                       - "dormant": pause if active
                                       - "inconclusive": no state change
                                                    │
                                                    ▼
                                       Schedule next subscription
                                       (now + checkIntervalSeconds)
                                                    │
                                                    ▼
                                       [Wait for next firing]
```

Note: this requires **two agent callbacks** to chain. The JSON API result must be passed to the LLM Inference call. The implementation tracks state across the two callbacks via a per-check struct keyed by request ID.

## Simplification for the hackathon demo

To reduce the chain to one agent call, an alternative is to have the JSON API agent return the data and the LLM Inference do the classification in a single combined call. But the LLM Inference agent's `inferString` doesn't natively fetch URLs — it operates on prompt text only.

The cleanest hackathon-grade implementation:

**Option A (recommended)**: Two-agent chain
- JSON API Request fetches GitHub activity JSON
- Pass the JSON as part of the prompt to LLM Inference
- LLM Inference classifies

**Option B (faster but less robust)**: Mocked GitHub data
- For the demo, hardcode a `mockGithubData(string memory user) returns (string memory)` function in `DripPolicies`
- Skip the JSON API agent for the demo, only invoke LLM Inference
- Reduces 2 callbacks to 1, simpler to reason about

**Recommendation**: Build Option A end-to-end, but with a `setMockMode(bool)` admin function that toggles to Option B for demo recording (so you don't depend on GitHub being responsive during the live demo).

## The classifier prompt (committed wording)

This prompt has been designed for determinism. Do not modify without re-testing determinism.

```
Role: You are a DAO contributor activity classifier. You make deterministic
judgments about contributor engagement based on GitHub commit data.

Task: Analyze the provided GitHub activity for one contributor over the past
7 days. Determine if they are:
- "active" — committed code at least 3 times OR opened/merged at least 1 pull request
- "dormant" — zero commits AND zero pull request activity
- "inconclusive" — any state between the two thresholds

Data source: The activity payload below is fetched from GitHub's REST API by
a Somnia JSON API Request agent. Fields include commit count, PR count, and
most recent commit timestamp.

Output: Reply with exactly one word from the allowed set: active, dormant,
inconclusive. No reasoning, no punctuation, no other words.

Activity data:
{activity_json}
```

Pair with `allowedValues = ["active", "dormant", "inconclusive"]` for safety.

### Determinism test cases

Before relying on this prompt in production demo, verify these expected outputs:

| Input | Expected output |
|---|---|
| `commitCount: 5, prCount: 2` | `"active"` |
| `commitCount: 0, prCount: 1` | `"active"` (PR OR clause) |
| `commitCount: 3, prCount: 0` | `"active"` (commit OR clause) |
| `commitCount: 2, prCount: 0` | `"inconclusive"` |
| `commitCount: 0, prCount: 0` | `"dormant"` |
| `commitCount: 1, prCount: 0` | `"inconclusive"` |

Run `scripts/test-classifier.ts` — it tests these cases automatically.

## Naming conventions

- Stream IDs start at 1 (0 is reserved as "unset")
- Policy IDs are equal to their stream IDs (1:1 mapping for the hackathon)
- Subscription IDs come from the precompile and are non-zero `uint256`
- Request IDs come from the platform contract and are non-zero `uint256`

## Mappings to maintain

```solidity
mapping(uint256 streamId => Stream) public streams;
mapping(uint256 streamId => Policy) public policies;
mapping(uint256 subscriptionId => uint256 streamId) public subscriptionToStream;
mapping(uint256 requestId => uint256 streamId) public requestToStream;
mapping(uint256 requestId => bool) public pendingRequests;
mapping(uint256 requestId => string) public pendingActivityData;  // bridges two-agent chain
uint256 public nextStreamId;
```

## Events to emit

```solidity
event StreamCreated(uint256 indexed streamId, address indexed sender, address indexed recipient, uint256 totalAmount, uint256 ratePerSecond, uint256 startTime, uint256 endTime);
event StreamPaused(uint256 indexed streamId, string reason);
event StreamResumed(uint256 indexed streamId);
event StreamCancelled(uint256 indexed streamId);
event StreamCompleted(uint256 indexed streamId);
event Withdrawal(uint256 indexed streamId, address indexed recipient, uint256 amount);

// Policy events — these populate the demo's "agent decision feed"
event PolicyCheckScheduled(uint256 indexed streamId, uint256 indexed subscriptionId, uint256 scheduledFor);
event PolicyCheckStarted(uint256 indexed streamId);
event GithubDataFetched(uint256 indexed streamId, uint256 indexed requestId, string activityJson);
event ClassificationReceived(uint256 indexed streamId, uint256 indexed requestId, string verdict);
event PolicyActionTaken(uint256 indexed streamId, string verdict, string action);
```

The frontend agent-decision feed subscribes to these events to render the live demo magic moment.

## What NOT to do

1. **Do not** make the streaming primitive depend on the agent layer. `Drip.sol` should still function as a manual streaming protocol even if no policies are registered. The agent layer is additive, not mandatory.

2. **Do not** recompute stream balances using a different formula in different functions. Have a single internal `_availableBalance(streamId)` view that all other functions use.

3. **Do not** allow stream creation if Drip's balance can't cover the new stream's total commitment. Solvency invariant must hold at every state-changing operation.

4. **Do not** allow withdrawal of more than the available balance. Always `min(requested, available)`.

5. **Do not** forget that `cancel` on a paused stream still refunds the unused portion to the sender. The recipient gets only what accrued before pause.

6. **Do not** allow the same stream to have multiple active policy subscriptions. One stream, one current subscription.

7. **Do not** unsubscribe in `_onEvent`. Schedule subscriptions are one-shot — they auto-remove after firing. Calling `unsubscribe` inside `_onEvent` on the subscription that's currently firing is a recipe for confusion.

## Solvency check

Add a public view function `treasuryHealth()` that returns:

```solidity
struct TreasuryHealth {
    uint256 contractBalance;            // address(this).balance
    uint256 totalCommittedUnreleased;   // sum of (totalAmount - withdrawn) across active streams
    uint256 reactivityReserve;          // 32 STT minimum for subscriptions
    bool isHealthy;                     // contractBalance >= totalCommittedUnreleased + reactivityReserve
}
```

Surface this in the frontend dashboard. Judges should see that the protocol is solvent in real time.
