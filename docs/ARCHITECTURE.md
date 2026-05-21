# Architecture

_Fill this in as the build progresses. Target audience: a Somnia engineer reading the submission cold._

## System overview

(Insert architecture diagram here. A simple flowchart: User → Drip → DripPolicies → Reactivity → Agents → callbacks → state change.)

## Contracts

### Drip.sol
TODO: explain what this contract owns vs delegates, the stream lifecycle states, the math model, and why it inherits from SomniaEventHandler.

### DripPolicies.sol
TODO: explain the agent control loop, the two-agent chain, and the self-rescheduling subscription pattern.

## Agent invocation chain

TODO: sequence diagram showing:
- t=0: createStream
- t=interval: Schedule subscription fires → Drip._onEvent → DripPolicies.startPolicyCheck → JSON API Request
- t=interval+~3s: JSON API callback → LLM Inference invocation
- t=interval+~6s: LLM Inference callback → action applied → next subscription scheduled

## Why this can only exist on Somnia

TODO: argue from three angles — deterministic LLM consensus, on-chain Reactivity scheduling, 100ms block times.

## Design decisions

TODO: document the choices and tradeoffs:
- Two contracts vs one
- Native STT vs ERC-20
- Self-rescheduling Schedule vs recurring BlockTick
- Two-agent chain vs single-agent (LLM only)
- Majority consensus with allowedValues

## Known limitations

TODO: be honest about what's missing — what would v2 add?

## Security considerations

TODO: list the trust assumptions, the gating mechanisms, the funding flow, the failure modes for under-funded subscriptions.
