---
target: DPS-76 app (full build, via AppShell.tsx)
total_score: 32
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-08-10T15-55-04Z
slug: src-components-layout-appshell-tsx
---
Method: dual-agent (A: general-purpose/sonnet · B: general-purpose/sonnet)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | DeltaFlash on every changed number, stale-opacity spinner mid-resim, sticky condensed strip keeps DPS visible while scrolling. |
| 2 | Match System / Real World | 4 | Speaks the FO76 min-maxer's language exactly — in-game formula names, real drop-level-only weapons, Pip-Boy vocabulary. |
| 3 | User Control and Freedom | 3 | No undo for `Import Build` overwriting the whole perk list; no visible "reset section to defaults." |
| 4 | Consistency and Standards | 2 | The system's two most-repeated Named Rules (No-Radius, Numerals-≥10-12px) are each broken in 7+ files/12+ live instances — a real break in the system's own core discipline, not an edge case. |
| 5 | Error Prevention | 3 | Good input clamps (crippled-limb max, real weapon levels only), but over-budget perk builds are flagged after the fact rather than prevented at entry. |
| 6 | Recognition Rather Than Recall | 4 | Every accordion header carries a live summary ("Pirate Punch · 4 mods", "2 ACTIVE") — the whole build stays scannable collapsed. |
| 7 | Flexibility and Efficiency | 3 | N&D paste-import and one-click Apply are real accelerators; no saved presets, no keyboard shortcuts beyond native tab/enter. |
| 8 | Aesthetic and Minimalist Design | 3 | Ledger view is correctly gated behind progressive disclosure, but Conditions/Target sections are long flat control lists with no sub-grouping. |
| 9 | Error Recovery | 3 | The one testable error (bad N&D link) is plain-language, inline, dismissible — good pattern, but only one error surface was exercised. |
| 10 | Help and Documentation | 3 | Thorough inline help under nearly every control; zero onboarding/glossary — consistent with the product's stated "not yet" trajectory, not a defect today. |
| **Total** | | **32/40** | **Good** |

*(Assessment A's raw scores summed to 33; Consistency and Standards is revised down from 3 to 2 here to weight in Assessment B's mechanically-confirmed second rule break — see below — bringing the total to 32/40. No heuristic was marked n/a; all ten apply to this Operate-mode surface.)*

## Design Specificity Verdict

**Strongly grounded, with mechanically-confirmed cracks in the system's own strictest rules.**

**LLM assessment**: This is not a reskinned SaaS dashboard. The VATS Bracket Frame (`.vats-brackets`) is confirmed used in exactly one place — `ScenarioCard.tsx` — real scarcity, not just claimed. The Derivation Ledger Table renders the actual paper-damage formula as an itemized, hand-checkable printout. CritGauge's segmented dash meter is mechanically literal to FO76's own crit-cadence system. Domain vocabulary (Onslaught, Bullet Storm, Concentrated Fire, Battle-Loader's, Tenderizer stacks) is load-bearing in the copy itself, not glossed over. Where genericness leaks in: the SPECIAL/HP stat pills at the very top of the primary panel — the single most-viewed element in the app — render with visible rounded corners, the most "generic starter template" look in the entire UI, sitting directly against a system whose identity is built on zero-radius.

**Deterministic scan**: `detect.mjs --json src/components` returned **exit 2, 12 findings**, all one rule (`design-system-font-size`, advisory) — `text-[10px]`/`text-[0.625rem]`/`text-[9px]` instances in `ActionDelta.tsx:32`, `ApEconomyPanel.tsx:25`, `CritGauge.tsx:55`, `DeltaFlash.tsx:33`, `MultiplierChainTable.tsx:45`, `SuggestionsPanel.tsx:24/34/101/150`, `badge.tsx:9`, `banner.tsx:30`, `slider.tsx:87`. The live in-browser detector corroborated this independently: **25 grouped console findings** (29 raw log lines) on the desktop view, the largest cluster being 8× `undersized-ui-text` (9-10px functional text: "Alpha" badge, "HP", slider tick labels "10"/"20"/"30"/"40"/"50", "2 active" counts) plus 3× `tiny-text` (10-11px body copy), 4× `line-length` (~91 chars/line vs. the ~80 target), 3× `layout-transition`/`clipped-overflow-container` (Base UI accordion internals — likely library markup, not app-authored), 2× `nested-cards` (shadcn input-group wrappers — same caveat), and 2 findings judged likely false positives on inspection (see below).

**Where LLM and detector agree**: both independently converged on the same underlying pattern — DESIGN.md's two most emphatic, most-repeated Named Rules ("no exceptions, ever" on radius; the 10–12px Micro Label floor on type) are each breached in double digits across the codebase, concentrated in exactly the small-caption/badge/pill components that are meant to carry the system's precision. Assessment B additionally caught the 9px slider-tick labels, which fall outside even DESIGN.md's own documented 10-12px *range* — a clearer-cut violation than the 10px instances, which arguably match the prose Hierarchy section even though they miss the strict machine-readable token list (worth resolving that internal doc inconsistency regardless).

**Possible false positives flagged by Assessment B, not corrected by it**: (1) `skipped-heading` — attributed an `<h3>` to text that is actually a `<span>` inside an `AccordionTrigger` (`BreakdownPanel.tsx:31-33`); the app has exactly one heading tag total (`Header.tsx`'s `<h1>`), so this finding's DOM attribution doesn't match reality — discard. (2) `gradient-text` (2×) — zero `bg-clip-text`/`bg-gradient`/`background-clip` matches anywhere in app source; plausibly the live-detector's own injected overlay UI being picked up by its own scan — discard.

**Visual overlays**: injection succeeded and overlays/console findings were captured live in a fresh tab, but that tab was closed during Assessment B's cleanup per protocol — there is no overlay left open in your browser to view. The raw findings above are the full record.

## Overall Impression

DPS-76 earns its "instrument panel, not marketing surface" ambition — the Ledger Table and CritGauge are the real thing, not decoration wearing a terminal skin. The gap between that ambition and the shipped code is narrow but concrete: the system's own two strictest, most-repeated rules (zero radius, everywhere; numerals stay large enough to read) are each broken in enough places that "no exceptions, ever" currently reads as aspirational rather than enforced. The single biggest opportunity is closing that gap mechanically — a lint rule or two would prevent regression — rather than any deeper reconception of the product.

## What's Working

1. **Derivation Ledger Table** (`MultiplierChainTable.tsx`) — lives up to DESIGN.md's own claim as "the clearest expression of the terminal metaphor." Every headline number is traceable by hand, exactly what a spreadsheet-native theorycrafter audience needs to trust the tool.
2. **Accordion `SectionTrigger` summaries** — turning every collapsed section into a scannable status line ("Human · 1·3·1·1·1·1·1 · 2 cards", "2 ACTIVE") is a Recognition-over-Recall pattern most settings-heavy UIs skip entirely.
3. **DeltaFlash micro-interaction** — transient, `prefers-reduced-motion`-aware, strictly functional-color (never a permanently-tinted number per DESIGN.md's own rule), correctly spent on the app's highest-stakes readout.

## Priority Issues

**[P1] The No-Radius Rule is broken in the app's single most-viewed element.**
- **Why it matters**: `StatSummary.tsx` (lines 39, 52) renders the SPECIAL stat pills and HP pill with visibly rounded corners, confirmed by direct screenshot inspection, not just source reading. Root cause: the project remaps `rounded-{sm,md,lg,xl}` to 0 via its own `--radius-*` tokens, but bare `rounded` (no suffix) isn't remapped and falls through to Tailwind's ~4px default — the same leak recurs in `ArmorSection.tsx:222,245`, `BuffsSections.tsx:855`, `PerkEditorSection.tsx:102,135`, `SuggestionsPanel.tsx:34`. Separately, `components/ui/radio.tsx:19,26` uses `rounded-full`, producing genuinely circular radio buttons throughout Chems/Food-Drink/Magazines/Bobbleheads. DESIGN.md states "no exceptions, ever" twice for this rule; it's violated above the fold.
- **Fix**: sweep for bare `rounded`, replace with `rounded-none`; decide explicitly whether `rounded-full` on Radio is an intentional documented exception (input affordance) or should become a square/tick selector — then codify whichever choice as a lint rule so it can't silently regress.
- **Suggested command**: `/impeccable harden`

**[P1] No undo for the app's one clearly destructive action.**
- **Why it matters**: pasting a second Nukes & Dragons link silently and irretrievably replaces the entire perk loadout — "Importing replaces this list" is static help text, not a confirm step. This directly punishes the product's own stated common entry point: a user comparing two candidate imports loses the first one's tweaks the instant they paste the second link.
- **Fix**: a one-step "restore previous build" affordance scoped to the Import action.
- **Suggested command**: `/impeccable harden`

**[P1] Core stat definitions are accessible to mouse users only.**
- **Why it matters**: `ScenarioCard.tsx` delivers load-bearing definitions (`EFFECTIVE_DPS_DEFINITION`, `UPTIME_DEFINITION`, `BURST_DPS_DEFINITION`, ~6 instances) via the native HTML `title` attribute rather than the custom `Tooltip` component used elsewhere in the same app (e.g. `SuggestionsPanel`'s "ranked by..." tooltip). Native `title` has no reliable keyboard trigger and is invisible to touch/most screen-reader flows — a mouse user gets the full explanation of "effective dps," a keyboard-only or screen-reader user gets nothing, on the app's primary readouts.
- **Fix**: swap these `title` attributes for the app's own `Tooltip` component, matching the pattern already used elsewhere.
- **Suggested command**: `/impeccable audit`

**[P2] The Ledger Table — the app's own signature component — truncates its own row labels at ordinary widths.**
- **Why it matters**: confirmed live at the app's normal sidebar width (`clamp(340px,32vw,420px)`): "Body part (weakpoint)" renders as "Body part (weakpo…" and "race base" as "race …" in `BreakdownPanel`/`MultiplierChainTable`, even though the full string exists in the DOM. This component's entire value proposition — per DESIGN.md's own description — is hand-verifiable derivation; a truncated label breaks that promise at a completely ordinary viewport, not an edge case.
- **Fix**: drop `truncate` on ledger row labels (fixed two-column mono layout, wrapping costs nothing) or rebalance the label/value column widths.
- **Suggested command**: `/impeccable polish`

**[P2] The Micro Label typography floor is breached across badges, counts, and tick labels.**
- **Why it matters**: confirmed by two independent sources — the static detector (12 findings, `design-system-font-size`) and the live browser console (8 grouped `undersized-ui-text` findings covering the same components plus dynamically-rendered instances: "Alpha" badge, "HP" pill, slider tick labels at 9px, "2 active"/"1 active" counts). The 9px slider ticks (`slider.tsx:87`) fall outside even DESIGN.md's own documented 10–12px Micro Label range — the clearest-cut instance. This is exactly the caption/count/badge layer meant to carry the system's density and precision.
- **Fix**: raise the floor to the documented 10-12px range everywhere (start with `slider.tsx:87`'s 9px ticks), and resolve DESIGN.md's own internal inconsistency between its single-value typography token and its "10-12px" prose range so future audits have one number to check against.
- **Suggested command**: `/impeccable typeset`

## Persona Red Flags

**Alex (Power User)**: Hits the import-undo issue above directly — comparing two N&D imports back-to-back destroys the first with no recovery. Separately, the share/persist URL is a raw base64 blob (`#b=1.bZFLaxtBEIT...`, several hundred characters, no human-readable content) — sharing a build in a min-max Discord channel produces a link some clients will mangle and that previews nothing about what's inside, unlike the compact N&D `p=`/`s=` scheme this same app already reads from.

**Sam (Accessibility)**: The native-`title` tooltip gap above is the headline issue — keyboard/screen-reader users lose the definitions of `EFFECTIVE_DPS`, `UPTIME`, `BURST_DPS` entirely. Separately, `DeltaFlash`'s green/red pulse is the sole signal that a value changed and in which direction, with no shape/icon backup for color-blind users — `prefers-reduced-motion` strips the animation but not the color-only encoding underneath it.

**Jordan (First-Timer)**: The empty state itself is genuinely good — plain language, two clear next steps, a domain-appropriate crosshair icon. But one click into any populated section drops Jordan into "Points allocated: 9/56," "Legendary ★1-4," "Card cost is the card's own per-rank point cost (not always equal to rank)" with zero glossary. This matches the product's stated "not yet" trajectory exactly (Product Principle 3) and isn't a defect today, but is worth tracking as the roadmap moves toward broader accessibility.

## Minor Observations

- `ConditionsSection.tsx` stacks 15+ controls (Health, Food/Drink/Feral/Glow, Caps, Kill Streak, Onslaught, Bullet Storm, Concentrated Fire, two challenge trackers, Battle-Loader's Bash, Weapon Condition%, two resist fields, three switches) with zero subheadings; `TargetSection.tsx` has ~12 controls with only one bordered sub-group ("Accuracy"). Fails the chunking/grouping cognitive-load checks — worth a `/impeccable layout` pass reusing the existing micro-label pattern to cluster related controls.
- `SuggestionsPanel` (`PANEL_LIMIT=8`) showed 5 of 8 ranked options tied at exactly +32.1% in one test build with no distinguishing weight cue — leading with one emphasized "top pick" and collapsing the rest behind "show N more" would better serve the ≤4-choices rule and the power-user persona it's built for.
- 4× `line-length` findings (~91 chars/line vs. an ~80 target) on body-copy paragraphs — minor readability polish, bundle with the typeset pass above.
- Header's Live/PTS switch is disabled with an honest, specific tooltip explaining why — good disabled-state communication, no dead end.
- "ALPHA" badge correctly uses the muted `secondary` variant, not gold — doesn't compete with the One Accent Rule.
- The weapon-picker Combobox's portal-rendered popover keeps sharp corners and the collapsible "Unique weapons (93)" grouping — good token propagation into overlay surfaces.
- `layout-transition`/`clipped-overflow-container`/`nested-cards` detector findings hit Base UI accordion internals and shadcn input-group wrapper divs — library-generated markup, not bespoke app styling; low-confidence as real issues, noted for completeness rather than actioned.
- Mobile-width (~390px) verification was attempted by both assessments and failed identically in this environment (`resize_window` reported success but `window.innerWidth` never changed) — the responsive collapse (`AppShell.tsx`'s `lg:hidden`/`hidden lg:block` split, sticky condensed `HeadlineStrip`) is structurally sound by code inspection but unverified live in this run.

## Questions to Consider

- If "no exceptions, ever" already has one live semantic exception (circular radio dots) and seven accidental ones (bare `rounded`), is the rule more honest — and easier to enforce mechanically — with an explicit named carve-out for input affordances, backed by a lint rule?
- The suggestions engine can rank 8+ structural changes in milliseconds — but does showing all 8 at equal weight serve the person deciding what to change next, or does it mainly show off what the engine can compute?
- Two of DESIGN.md's own most-repeated rules (radius, type floor) drifted from enforced to aspirational without anyone noticing until this scan — is a pre-commit or CI-level version of `detect.mjs` worth wiring in, rather than relying on periodic critique runs to catch drift?
