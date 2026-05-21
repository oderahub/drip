# SKILL.md — Drip project skills

This directory contains Drip-specific knowledge that Claude Code should consult before writing or modifying code in this project.

## When to read which file

| File | Read before... |
|---|---|
| `skill-agents.md` | Writing or modifying any code that invokes Somnia Agents (JSON API Request, LLM Inference, LLM Parse Website), or any callback handler |
| `skill-reactivity.md` | Writing or modifying any code that uses Somnia Reactivity (subscriptions, handlers, scheduled events) |
| `skill-streaming.md` | Writing or modifying the Drip streaming primitive or the agent-control layer |

## Critical rule

These skill files encode hard-won bugs and patterns that the official Somnia docs do not yet teach. They take precedence over what you might find in the docs or example repos. In particular:

1. Always use the **floor + perAgentPrice × subcommitteeSize** deposit pattern. Never floor-only.
2. Always inherit from `SomniaEventHandler` for Reactivity handlers, never raw precompile interfaces.
3. Always implement `receive() external payable` on any contract that invokes agents or owns subscriptions.
4. Always gate callbacks with `require(msg.sender == platformAddress)` and `require(pendingRequests[requestId])`.
5. Always handle every `ResponseStatus` value (Success, Failed, TimedOut), never assume Success.

If you're about to write code that violates any of these rules, stop and re-read the relevant skill file.
