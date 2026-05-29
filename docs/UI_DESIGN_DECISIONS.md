# UI design decisions

This document locks the interface design choices for Drip's frontend, captured the day before Phase 3 began. The intent is that future changes go through a deliberate revision of this file rather than ad-hoc tweaks scattered across components.

## Visual reference

Drip's frontend takes structural cues from **[arcpay-somnia.vercel.app](https://arcpay-somnia.vercel.app)**: warm cream backgrounds, pure-white cards that lift via background contrast (not drop shadows), pillow-soft `0.875rem` radius, dark "moment" sections sparingly placed inside an otherwise light page, generously warm neutrals. Drip swaps arcpay's warm-orange primary for an emerald primary to differentiate and to align with the "active streaming / flowing value" semantic.

## State-colour palette (locked)

The most important UI concern in this app is whether a reviewer can glance at the agent decision feed and instantly tell what state each card represents — paused vs active vs inconclusive vs cancelled. The temptation is to make paused amber, but on a warm-cream background with an amber/gold accent that already exists, amber-on-amber muddies the signal exactly where it matters most.

Final palette, light-mode hex first / dark-mode hex second:

| Surface | Token | Light | Dark | Used for |
|---|---|---|---|---|
| **Active** | `primary` | `#099268` (emerald-700) | `#10b981` (emerald-500) | streams in `Active` status; the `active` verdict; the `resume` action; the live ticker; the "currently flowing" pulse ring; the primary CTA button |
| **Paused** | `state-paused` | `#4f46e5` (indigo-600) | `#818cf8` (indigo-400) | streams in `Paused` status; the `dormant` verdict; the `pause` action; the autonomous "agent acted" moment |
| **Inconclusive** | `state-inconclusive` | `#b45309` (amber-700) | `#fbbf24` (amber-400) | the `inconclusive` verdict; the `noop` action; classifier ran but no state change |
| **Completed** | `state-completed` | `#0d9488` (teal-600) | `#2dd4bf` (teal-400) | terminal status — duration elapsed, fully withdrawn, recipient happy |
| **Cancelled** | `state-cancelled` + destructive dot | `#64748b` (slate-500) + `#e62d28` dot | `#94a3b8` (slate-400) + `#ef4444` dot | terminal status — sender pulled out |
| **Accent** (decorative only) | `accent` | `#f5c761` (warm gold) | (same) | hero highlights, verified-determinism stat tiles; **never used as a state colour** |

**Why indigo for paused.** Indigo is the only cool hue in the system. The cream background, white cards, emerald primary, amber warning, and gold accent are all warm. An indigo paused-pill consequently pops in the feed without any extra effort — it is, by construction, the only thing on the page in that hue. This is the maximum-visual-distinctiveness property the design needs because paused is the demo's magic moment and the state reviewers will fixate on.

**Why teal (not emerald) for completed.** Both are green, but teal sits one step cooler on the wheel, which reads as "delivered / done" rather than "currently doing". Active streams' emerald pulse-rings and completed streams' static teal check-marks then never get confused at a glance, even at the small badge sizes used in lists.

**Why slate (not red) for cancelled.** Cancellations aren't errors. The sender chose to pull out. Slate with a tiny destructive dot conveys "deliberately ended" without crowding the feed with alarming red.

**Why amber-700 (not gold accent) for inconclusive.** The accent gold lives in the design system for decorative highlights (the verified-determinism stat tiles, hero badges). Reusing it as a state colour would force a context-dependent reading on the same hue. Amber-700 is darker, more saturated, more obviously a semantic signal — and it reads instantly as "deferred / yellow flag" without spilling into the destructive register.

**Where these live in code.** `frontend/app/globals.css` defines the CSS variables (light and dark). `frontend/tailwind.config.ts` exposes them as utility classes (`text-state-paused`, `bg-state-paused-bg`). `frontend/components/ui/badge.tsx` adds matching `variant`s (`paused`, `inconclusive`, `completed`, `cancelled`, `active`) so a component author can just write `<Badge variant="paused" />` and the right hue flows through.

## Mobile design for the agent decision feed

The agent decision feed is the demo-critical view. Anyone with a phone — judges, grant reviewers, the Somnia team — will open it on mobile, often before they ever see it on desktop. Mobile is the first-class layout, not a responsive afterthought.

### Layout at 390 px (iPhone 12 / 13 / 14 / 15 width)

```
┌─────────────────────────────────────────┐
│ ←  Stream #2                       ⋮    │  ← sticky page header (56px)
├─────────────────────────────────────────┤
│                                          │
│   ╭──────────────────────────────────╮  │
│   │  0.347291  STT                   │  │  ← @number-flow ticker, 44px digit
│   │  flowing into 0xbe9e…f23         │  │     font-variant-numeric: tabular
│   │  ─────────── 34% ────────────    │  │  ← progress bar, primary fill
│   │  ↓ 0.000386 STT/sec               │  │
│   ╰──────────────────────────────────╯  │
│                                          │
│   Agent decisions                  ↻    │  ← section header, refresh
│                                          │
│   ╭─●╮ PAUSED                      ↗︎  │  ← action card (most prominent)
│   │ │  by AI agent · 3 min ago         │     - bg: bg-state-paused-bg
│   │ │  Verdict: dormant                │     - ring: ring-state-paused/30
│   │ │  0 commits · 0 PRs · 7d window   │     - title: text-state-paused, lg
│   │ │  ▸ 3 validators agreed (tap)     │  ← collapsible per-validator detail
│   ╰─┴──────────────────────────────────╯
│   │
│   ╭─●╮ Classification received          │
│   │ │  4 min ago                        │     - bg: bg-card
│   │ │  "dormant" · 3/3 unanimous        │     - dot: text-state-paused
│   │ │  267 / 8 prompt / completion      │     - body: text-sm
│   │ │  Receipt #2094063 ↗︎              │  ← inline external link
│   ╰─┴──────────────────────────────────╯
│   │
│   ╭─●╮ GitHub data fetched              │
│   │ │  4 min ago                        │     - dot: text-success
│   │ │  Aggregator returned 90B          │
│   │ │  ▸ Show JSON                       │  ← tap reveals fenced code block
│   ╰─┴──────────────────────────────────╯
│   │
│   ╭─●╮ Schedule fired                   │
│   │ │  5 min ago                        │
│   │ │  60-second policy interval        │
│   │ │  Reactive tx ↗︎                   │
│   ╰─┴──────────────────────────────────╯
│   │
│   ╭─●╮ Policy registered                │
│   │    by you · 5 min ago               │
│   │    drip-dormant-test-xyz / vercel…  │
│   ╰────────────────────────────────────╯
│                                          │
│         Tap any card to expand          │
└─────────────────────────────────────────┘
```

### Anatomy of one card

- **Outer container**: `rounded-2xl border border-border bg-card`, 16 px padding all round. Action cards (the latest, e.g. PAUSED) get a tinted background (`bg-state-paused-bg`), a faint ring (`ring-1 ring-state-paused/30`), and slightly more padding (20 px) — they shout louder than the chronicle entries beneath.
- **Left gutter**: 32 px wide, contains the timeline dot (`size-3 rounded-full` in the state colour) centred on the card. A 1 px vertical line runs through the gutter continuously from one card to the next, gaps included, so the feed reads as a single timeline. The line is `bg-border` at 50% opacity.
- **Phase title row**: `text-base font-semibold tracking-tight` on the left, relative timestamp (`text-xs text-muted-foreground`) right-aligned. Long-press the timestamp to swap to absolute time (vaul drawer on mobile, tooltip on desktop).
- **Body**: one-line summary (`text-sm text-foreground/85`), followed by 1–2 lines of structured meta (`text-xs text-muted-foreground`). Hashes and request IDs use `font-mono`.
- **Footer pills**: small `Badge`s for outcomes, validator agreement, receipt link icons (`ExternalLink` at `h-3 w-3`).
- **Expand affordance**: a `▸ N validators agreed (tap)` row at the bottom. Tap reveals a nested table inside the same card — no modal, no page push. The table has one row per validator with prompt/completion tokens, elapsed ms, and the decoded result; horizontal scroll if it doesn't fit at 390 px (it usually does — 3 columns × ~80 chars).

### Motion

- **New event arrival**: `translateY(12px) → 0` + `opacity 0 → 1` + `scale 0.985 → 1`, easing `cubic-bezier(0.16, 1, 0.3, 1)`, duration 360 ms. The connecting timeline line scales-Y from 0 to fill the gap above the new card, 200 ms after the card finishes. Older cards stay still — no reorder, no shuffle.
- **Tap to expand**: card height interpolates via `framer-motion` `<motion.div layout>`, 280 ms ease.
- **The "PAUSED" moment**: when the latest event is a state change (pause / resume), the page header's stream-status pill cross-fades from one state colour to another in 600 ms — slow enough to be noticed. The action card itself plays a one-time `pulse-ring` animation (already defined in `tailwind.config.ts`) on its left-gutter dot for 2.4 s, then settles into the static dot.
- **Pull-to-refresh**: native iOS / Android pull behaviour preserved; on release, a Sonner toast confirms ("Up to date · 4 events").

### Why a timeline, not a flat list

A flat reverse-chronological list works on desktop but loses temporal narrative on mobile, where you only see 2-3 cards at a time. The continuous left-gutter line knits the cards together so a user scrolling through is always visually anchored to "earlier events were upstream of this one, later events follow." It also gives the colored dots a place to live without each card needing its own bulky status icon.

### Why expand-in-place, not modals

Tapping a card to dig into per-validator data is the second-most-common interaction. A modal would push the user out of the chronology; nested expand-in-place keeps them anchored. The `<motion.div layout>` animation is forgiving on slow networks (no awaiting fetch — the per-validator data lives in the same event object).

### Accessibility considerations

- Each card is a `button` element when tappable, with `aria-expanded`.
- Colour is never the only signal: every state pill carries text plus a small phase icon, so a colour-blind reviewer reads "PAUSED" and sees a pause-icon glyph alongside the indigo background.
- Focus rings on `:focus-visible` use the global emerald ring; tab order walks the feed in chronological order (latest first).
- The relative-timestamp text includes an invisible absolute time string for screen readers (`<span class="sr-only">2026-05-26 02:47 UTC</span>`).

### What ships when

- The static structural layout: Phase 3 (the dark "Watch the agent decide" mockup band uses an autoplaying scripted version of this feed).
- The interactive expand-in-place + framer-motion `layout` animations: Phase 5 (`/streams/[id]`).
- Real-time event arrival via viem `watchContractEvent` over Somnia WebSocket: Phase 5.
- Pull-to-refresh + the Sonner "up to date" toast: Phase 5.

## What this document is not

This is not a design system spec or component library reference — it's a record of intent for two specific decisions (state palette and mobile feed). Anyone reading the codebase can read the source for the actual implementation; this file exists to explain the reasoning so the next person knows what they'd be changing if they touched it.
