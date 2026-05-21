# skill-agents.md — Somnia Agents patterns and gotchas

**Read this before writing any code that invokes a Somnia Agent.**

This file consolidates the official Somnia Agents documentation, the SomniaDevs "Building on the Agentic L1" guide, and lessons from a systematic pre-launch audit of the platform. Some patterns here predate the official docs being updated to teach them.

---

## The platform contract addresses

| Network | Chain ID | Platform contract address |
|---|---|---|
| Testnet | `50312` | `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776` |
| Mainnet | `5031` | `0x5E5205CF39E766118C01636bED000A54D93163E6` |

RPC URLs:
- Testnet: `https://api.infra.testnet.somnia.network`
- Mainnet: `https://api.infra.mainnet.somnia.network`

WebSocket:
- Testnet: `wss://api.infra.testnet.somnia.network/ws`
- Mainnet: `wss://api.infra.mainnet.somnia.network/ws`

## The base agents

| Agent | ID (same on testnet + mainnet) | Cost per validator | Notes |
|---|---|---|---|
| JSON API Request | `13174292974160097713` | `0.03` STT/SOMI | Fetch external HTTP endpoints, JSON-path selectors |
| LLM Inference | `12847293847561029384` | `0.07` STT/SOMI | Qwen3-30B, deterministic, supports `inferString` with `allowedValues` |
| LLM Parse Website | `12875401142070969085` | `0.10` STT/SOMI | **CURRENTLY BROKEN on testnet — service returns HTTP 400 deterministically across all validators. Do not use.** |

The default subcommittee size is `3`.

## The deposit formula (the most important thing in this file)

For any agent call:

```
msg.value ≥ getRequestDeposit() + pricePerAgent × subcommitteeSize
```

For default subcommittee size of 3:

| Agent | Floor (`getRequestDeposit`) | Reward (per-agent × 3) | Total minimum deposit |
|---|---|---|---|
| JSON API Request | 0.03 | 0.09 | **0.12 STT** |
| LLM Inference | 0.03 | 0.21 | **0.24 STT** |
| LLM Parse Website | 0.03 | 0.30 | **0.33 STT** |

### The floor-only anti-pattern (the most common mistake)

```solidity
// WRONG — this is the floor-only anti-pattern
uint256 deposit = platform.getRequestDeposit();
platform.createRequest{value: deposit}(...);
```

`getRequestDeposit()` returns only the operations-reserve floor. Sending only this amount produces `perAgentBudget = 0`. Runners see this and skip the request. The request will eventually return `ResponseStatus.Failed` (status `3`) — note: **NOT** `TimedOut` (status `4`) as the older docs imply.

A developer who sees `status = 3` typically debugs the API URL, selector, or payload before suspecting the deposit. Don't fall into this trap.

### The correct pattern

```solidity
uint256 constant SUBCOMMITTEE_SIZE = 3;
uint256 constant JSON_API_PRICE_PER_AGENT = 0.03 ether;

uint256 reserve = platform.getRequestDeposit();
uint256 reward = JSON_API_PRICE_PER_AGENT * SUBCOMMITTEE_SIZE;
uint256 deposit = reserve + reward;

require(msg.value >= deposit, "Underfunded");

requestId = platform.createRequest{value: deposit}(
    JSON_API_AGENT_ID,
    address(this),
    this.handleResponse.selector,
    payload
);
```

## The four critical implementation rules

These come directly from the SomniaDevs "Four Tips That Save Hours" guidance, plus our own audit findings.

### Rule 1: Send the right deposit

See above. Floor + (perAgentPrice × subSize).

### Rule 2: Implement `receive() external payable`

The platform pushes rebates (unused deposit) automatically on finalisation. Without `receive() external payable`, the transfer fails silently and funds stick in the platform contract.

```solidity
receive() external payable {}
```

Always include this on any contract that invokes agents.

### Rule 3: Gate your callback

`handleResponse` (or whatever you name your callback) is `external`. Without gating, anyone can spoof it.

```solidity
function handleResponse(
    uint256 requestId,
    Response[] memory responses,
    ResponseStatus status,
    Request memory details
) external {
    require(msg.sender == address(platform), "Only platform");
    require(pendingRequests[requestId], "Unknown request");
    delete pendingRequests[requestId];
    // ...
}
```

### Rule 4: Handle every status

A request can finalise with `ResponseStatus.Success`, `ResponseStatus.Failed`, or `ResponseStatus.TimedOut`. Decoding `responses[0].result` on a non-Success status will revert.

```solidity
if (status == ResponseStatus.Success && responses.length > 0) {
    // decode and use responses[0].result
} else if (status == ResponseStatus.Failed) {
    // handle failure — possibly retry, possibly fall back
} else if (status == ResponseStatus.TimedOut) {
    // handle timeout — log and possibly retry
}
```

## The request lifecycle (two-transaction async)

1. Your contract calls `platform.createRequest{value: deposit}(agentId, callbackAddress, callbackSelector, payload)`.
2. `createRequest` returns a `requestId` immediately. Your transaction ends.
3. Off-chain: the platform elects a subcommittee, each validator runs the agent, results are submitted.
4. When consensus is reached (or failure/timeout occurs), the platform calls back into your contract via `callbackAddress.callbackSelector(requestId, responses, status, request)`.
5. Your callback handler updates state.

**This is async.** The return value of `createRequest` is not the result — it's the tracking ID. Mark pending requests in storage and clear them in the callback.

## The interfaces

The `ISomniaAgents.sol` interface in the official examples repo has a `Request` struct missing the `perAgentBudget` field. Use the corrected version in `contracts/contracts/interfaces/IAgentRequester.sol`. The full corrected `Request` struct ends with `uint256 remainingBudget` AND `uint256 perAgentBudget`.

## LLM Inference: structured prompts for determinism

The Somnia dev team has publicly endorsed a 4-part prompt structure for on-chain LLM agents:

1. **Role** — what the agent is
2. **Task** — what it needs to do
3. **Data source / tools** — where the data comes from
4. **Output** — how results should be returned

For consensus-friendly classification, always:
- Constrain output via `inferString.allowedValues` to a small set of exact strings
- Use output discipline ("exactly one word", "no reasoning", "no punctuation")
- Provide three answer paths, not two — include an `"inconclusive"` or `"uncertain"` option as a graceful-degradation path so borderline cases don't break consensus

Example prompt structure that has proven determinism-safe:

```
Role: You are a [domain] classifier. You make deterministic judgments based on [data type].

Task: Analyze the provided [data] and classify as:
- "[value_a]" — [precise threshold]
- "[value_b]" — [precise threshold]
- "[value_c]" — [inconclusive / between thresholds]

Data source: [where the data comes from]

Output: Reply with exactly one word from the allowed set: [value_a], [value_b], [value_c]. No reasoning, no punctuation, no other words.

Data: {data_json}
```

Always pair with `allowedValues = ["value_a", "value_b", "value_c"]` for safety net.

## Diagnosing failed requests

The receipts web UI at `https://agents.testnet.somnia.network/receipts/{requestId}` (testnet) or the mainnet equivalent shows per-validator execution details, including:
- Per-validator status (success / agent_error / etc.)
- Determinism indicator (all validators agreed / disagreed)
- Bandwidth and LLM token usage
- Structured error fields

**The documented programmatic endpoint** `https://receipts.testnet.agents.somnia.host?requestId=X` **currently returns 404** on all variations tested. Use the web UI URL.

## Agent Explorer

[https://agents.testnet.somnia.network/](https://agents.testnet.somnia.network/) provides:
- Per-method deposit calculator
- Auto-generated Solidity and TypeScript snippets per agent method
- Agent ID lookup

Strongly recommend opening this for any new agent method to confirm the exact ABI shape before writing the encode payload.

## Solidity snippet — canonical first integration

This is the verified-working BTC price oracle pattern from the SomniaDevs guide. Every other JSON API Request call follows this exact shape.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {
    IAgentRequester,
    IAgentRequesterHandler,
    Response,
    Request,
    ResponseStatus
} from "../interfaces/IAgentRequester.sol";

interface IJsonApiAgent {
    function fetchUint(string calldata url, string calldata selector, uint8 decimals)
        external returns (uint256);
}

contract BtcPriceOracle is IAgentRequesterHandler {
    IAgentRequester public immutable platform;
    uint256 public constant JSON_API_AGENT_ID = 13174292974160097713;
    uint256 public constant SUBCOMMITTEE_SIZE = 3;
    uint256 public constant PRICE_PER_AGENT = 0.03 ether;

    uint256 public latestPrice;
    mapping(uint256 => bool) public pendingRequests;

    event PriceReceived(uint256 indexed requestId, uint256 price);

    constructor(address platform_) {
        platform = IAgentRequester(platform_);
    }

    function requestBitcoinPrice() external payable returns (uint256 requestId) {
        bytes memory payload = abi.encodeWithSelector(
            IJsonApiAgent.fetchUint.selector,
            "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
            "bitcoin.usd",
            uint8(8)
        );

        uint256 deposit = platform.getRequestDeposit()
                       + PRICE_PER_AGENT * SUBCOMMITTEE_SIZE;
        require(msg.value >= deposit, "Underfunded");

        requestId = platform.createRequest{value: deposit}(
            JSON_API_AGENT_ID,
            address(this),
            this.handleResponse.selector,
            payload
        );
        pendingRequests[requestId] = true;
    }

    function handleResponse(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory /* details */
    ) external override {
        require(msg.sender == address(platform), "Only platform");
        require(pendingRequests[requestId], "Unknown request");
        delete pendingRequests[requestId];

        if (status == ResponseStatus.Success && responses.length > 0) {
            latestPrice = abi.decode(responses[0].result, (uint256));
            emit PriceReceived(requestId, latestPrice);
        }
    }

    receive() external payable {}
}
```

## Composition: agents + Reactivity

For autonomous agent invocation on a schedule (Drip's core pattern), see `skill-reactivity.md` for how to wire Reactivity subscriptions to trigger agent calls. The pattern in short:

1. A `Schedule(uint256)` subscription is created via `SomniaExtensions.scheduleSubscriptionAtTimestamp(address(this), futureMs, options)`.
2. When the timestamp is reached, the subscription fires and the reactivity precompile calls back into `address(this).onEvent(...)` (handled by `SomniaEventHandler`).
3. Inside `_onEvent`, the contract calls `platform.createRequest(...)` to invoke an agent.
4. When the agent callback fires (separate transaction), the contract acts on the result and schedules the next subscription via another `scheduleSubscriptionAtTimestamp`.

This creates a self-perpetuating chain. See `skill-reactivity.md` for the precompile details.
