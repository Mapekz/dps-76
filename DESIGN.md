---
name: DPS-76
description: A Pip-Black terminal instrument panel for computing Fallout 76 outgoing DPS
colors:
  terminal-black: "oklch(0.19 0.01 145)"
  terminal-cream: "oklch(0.915 0.02 95)"
  panel: "oklch(0.23 0.012 145)"
  panel-popover: "oklch(0.22 0.012 145)"
  vault-gold: "oklch(0.82 0.14 80)"
  vault-gold-ink: "oklch(0.2 0.012 130)"
  panel-recede: "oklch(0.27 0.014 145)"
  muted-ink: "oklch(0.67 0.02 130)"
  accent-panel: "oklch(0.29 0.016 140)"
  ember-red: "oklch(0.73 0.16 35)"
  border-line: "oklch(0.31 0.015 145)"
  input-line: "oklch(0.33 0.015 145)"
  phosphor-green: "oklch(0.83 0.14 155)"
typography:
  section-label:
    fontFamily: "'Barlow Condensed', 'Barlow', sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0.14em"
  micro-label:
    fontFamily: "'Barlow', ui-sans-serif, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.1em"
  body:
    fontFamily: "'Barlow', ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.625
    letterSpacing: "normal"
  readout:
    fontFamily: "'Spline Sans Mono Variable', ui-monospace, monospace"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "normal"
rounded:
  none: "0px"
spacing:
  card-default: "24px"
  card-sm: "20px"
components:
  button-primary:
    backgroundColor: "{colors.vault-gold}"
    textColor: "{colors.vault-gold-ink}"
    rounded: "{rounded.none}"
    typography: "{typography.micro-label}"
    padding: "0 24px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "oklch(0.82 0.14 80 / 0.8)"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.terminal-cream}"
    rounded: "{rounded.none}"
    typography: "{typography.micro-label}"
  badge-default:
    backgroundColor: "{colors.vault-gold}"
    textColor: "{colors.vault-gold-ink}"
    rounded: "{rounded.none}"
    typography: "{typography.micro-label}"
    padding: "2px 8px"
  card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.terminal-cream}"
    rounded: "{rounded.none}"
    padding: "{spacing.card-default}"
---

# Design System: DPS-76

## Overview

**Creative North Star: "The Pip-Black Terminal"**

DPS-76 reads as an active phosphor-black instrument screen, not a marketing surface. The default (and identity-leading) state is near-black with a warm, slightly green-grey cast — the code's own comment calls it "phosphor-terminal ancestry, no CRT kitsch": the palette and density of a wasteland data terminal, deliberately without scanlines, glow, vignette, or flicker. A single warm accent — vault gold — stands in for the terminal's one "power light": selection, primary action, and brand all read through the same hue, nothing else competes with it for attention. A light mode exists as the terminal's printed counterpart (the same ink + vault-gold relationship rendered on warm paper instead of a lit screen) but the terminal state is the lead identity this system is designed from.

Every surface is sharp-cornered — `--radius: 0` is not a default left unset, it is enforced everywhere: buttons, cards, inputs, switches, tooltips, even the tooltip's little arrow. Depth is conveyed by hairline borders and a near-invisible `ring-1 ring-foreground/5`, never by drop shadow. The one recurring ornamental device is a targeting-HUD corner bracket (`.vats-brackets`, lifted directly from the game's own VATS framing) that frames the two scenario cards a player watches most closely — decoration earns its place only when it's diegetic to the product's own subject matter, not applied generically.

Numbers are the product. Every numeric readout — DPS, percentages, seconds, AP — renders in Spline Sans Mono with `tabular-nums`, while every word around it renders in Barlow or Barlow Condensed. That split is load-bearing: a reader's eye should never have to guess whether a token on screen is prose or a value to act on.

**Key Characteristics:**
- Near-black, warm-grey-green terminal surface as the default, identity-leading state; light mode is the same relationship on warm paper.
- One accent color (vault gold) carries brand, selection, and primary action — never spent decoratively.
- Universal zero-radius: every surface is sharp-cornered, no exceptions.
- Depth via hairline border + near-invisible ring, never drop shadow.
- Numbers in monospace, words in humanist sans — a strict, consistent split.
- The corner-bracket "VATS frame" is the one signature ornament, reserved for the scenario readouts it's thematically drawn from.

## Colors

The palette is desaturated and warm-neutral at rest; color is spent only to mean something (selection, gain, loss), never to decorate. Dark-mode values are this file's frontmatter `colors.*` block, pinned against `src/index.css`'s `.dark` block by a test — not repeated below. Light-mode values have no frontmatter representation (the block above is dark-mode only) and are given here as the sole source.

### Primary
- **Vault Gold** (`colors.vault-gold`): the system's one accent. Used for the primary button, active/checked switches and toggles, focus rings, the emphasized scenario's corner brackets, and any "this is selected / this is the brand" signal. Renders darker (`oklch(0.66 0.13 75)`) in light mode to hold contrast on warm paper.

### Neutral
- **Terminal Black** (`colors.terminal-black`): the base screen surface (dark, default).
- **Field Paper** (`oklch(0.955 0.012 95)`, light mode background): the printed counterpart to Terminal Black.
- **Terminal Cream** (`colors.terminal-cream`): body text / ink on the dark screen.
- **Faded Ink** (`oklch(0.26 0.015 130)`, light mode foreground): body text on paper.
- **Panel** (`colors.panel` / popover `colors.panel-popover`): card and popover surfaces, one step lighter than the base screen.
- **Panel Recede** (`colors.panel-recede`): secondary/muted surfaces — deliberately close to Panel so muted content recedes rather than boxes itself off.
- **Muted Ink** (`colors.muted-ink`): secondary/caption text.
- **Border Line** (`colors.border-line`): the hairline that does almost all of this system's depth work.

### Functional (reserved meanings — never decorative)
- **Phosphor Green** (`colors.phosphor-green`, darker `oklch(0.53 0.14 150)` in light mode): positive deltas only — a number that just went up. Never a static label color.
- **Ember Red** (`colors.ember-red`, darker `oklch(0.55 0.19 30)` in light mode): negative deltas and destructive actions. Same hue family in both roles is intentional — "this got worse" and "this is destructive" read as one register.

### Reserved (unused today)
- A five-step chart palette (`chart-1`…`chart-5`: gold, phosphor green, a blue at hue 230, ember red, a violet at hue 300) is declared as CSS tokens but not yet consumed by any component. Treat it as pre-registered for a future data-visualization surface, not as license to introduce ad hoc chart colors elsewhere.

### Named Rules
**The One Accent Rule.** Vault Gold is the only color allowed to mean "this is the brand" or "this is selected." If a new component needs a second attention-grabbing color, that's a sign it should use Gold, not that the palette needs a second accent.

**The Functional-Only Color Rule.** Outside of Vault Gold, color exists only to report a fact the user needs (gain, loss, error, selection state). No badge, icon, or panel is tinted for decoration or mood.

## Typography

**Body Font:** Barlow (400/500/600), with `ui-sans-serif, system-ui, sans-serif` fallback
**Label Font:** Barlow Condensed (500/600), with `'Barlow', sans-serif` fallback — same family tree, condensed for density
**Readout Font:** Spline Sans Mono Variable, with `ui-monospace, monospace` fallback

**Character:** A humanist grotesk doing double duty as both body copy and, condensed, as tracked-uppercase instrument labels; a true monospace is reserved exclusively for values. The pairing reads as "terminal readout," not "app UI" — labels are terse and shouted in small caps, values are exact and tabular.

### Hierarchy

Each voice below is a component in `src/components/ui/typography.tsx` — `Title`,
`SectionLabel`, `MicroLabel`, `Body`, `Readout` — that owns every axis (family, size,
weight, tracking, leading) as one unit, pinned against this section's frontmatter by
`src/data/__tests__/design-tokens.test.ts`. Outside `typography.tsx` itself and the
vendored Base UI wrappers under `ui/` (which keep their own upstream-shaped classes),
app code reaches for the component rather than hand-typing the voice's classes —
that's what keeps this table from drifting out of sync with the app the way it once
did (13 different class strings for Section Label alone, `text-[11px]` sitting
alongside the `text-2xs` token meant to replace it).

- **Header Title** (`Title`; 600, `text-xl`/20px, tight): Barlow Condensed, uppercase, `tracking-[0.12em]` — the app name in the header, the only place this large a label appears.
- **Section Label** (`SectionLabel`; 600, 11px, `tracking-[0.14em]`): Barlow Condensed, uppercase — "Damage output," "Suggestions," scenario names. The system's primary structural label voice. `size="lg"` (14px) is the documented larger exception for an accordion section's own trigger label (`SectionTrigger`).
- **Micro Label** (`MicroLabel`; 600, `tracking-widest`): Barlow (not condensed), uppercase. Denser and un-condensed on purpose so it doesn't compete with Section Labels. A shared *voice*, not one fixed size — 10px (`text-3xs`, `0.625rem`) is the default for badges, group headings, and other micro text; buttons and `size="sm"` render it at 12px (`text-xs` — see Buttons below); the one exception in the other direction is `size="lg"`, the card/panel Title (see Cards below). `lint-design.ts` enforces a 10px floor under this voice, not a fixed size.
- **Body** (`Body`; 400, 14px, relaxed line-height): Barlow — descriptions, helper copy, tooltip content. `HelperText` (`ui/helper-text.tsx`) is this voice at the muted 12px caption scale, width-capped to `max-w-prose`.
- **Readout** (`Readout`; 500, 14–24px, tight, tabular-nums): Spline Sans Mono — every DPS/percentage/seconds/AP value on screen, from the headline DPS number down to a single row in the multiplier-chain ledger. `size="sm"`/`"md"`/`"lg"` cover 12/14/24px; `DeltaFlash` and `DeltaText` (the pulsing/delta numbers) bundle the same `font-mono tabular-nums` pairing independently rather than wrapping `Readout`, since their color/animation logic needs the full class string under its own control.

The app's heading outline runs `Title level={1}` (the page's one `<h1>`, in `Header`) →
`SectionLabel`/`CardTitle level={2..3}` (panel and accordion-section titles — Base
UI's `AccordionHeader` already wraps every accordion trigger in an unconditional
`<h3>`, which is why panel titles outside an accordion match it at `level={3}` rather
than `level={2}`) → `GroupHeading` (`ui/group-heading.tsx`, wrapping `SectionLabel
level={4}`) for a cluster of controls within a section.

### Named Rules
**The Numerals-Are-Mono Rule.** Any value that answers "how much" renders in Spline Sans Mono with `tabular-nums`. Everything else — labels, sentences, names — renders in Barlow or Barlow Condensed. A component that mixes the two within one number is a bug, not a style choice.

**The Two Uppercase Voices Rule.** Structural section labels use Barlow Condensed; micro-labels on interactive controls (buttons, badges, field captions) use plain Barlow. Don't collapse them into one — the condensed voice marks "this organizes the page," the plain voice marks "this is a control."

## Layout

A full-width Encounter card (Player vs Target: scenario readout, fight-state toggles,
target config) spans both columns above the grid — the player defines what they're
optimizing for before descending into Build.

Below it, desktop is the same two-column instrument layout as before: the
build-configuration column (accordion sections — see `docs/architecture.md`'s UI flow
for the actual section list and order, rather than restating it here) takes the wider,
flexible `1fr` track; the results column is a narrower fixed-ish
`clamp(340px, 32vw, 420px)` sidebar that stays legible without ever growing to
dominate the page. Both sit inside a `container mx-auto` with `px-4` gutters.

Below the `lg` breakpoint the layout collapses to a single column: the Encounter
card first, results (suggestions/breakdown) next, build sections last.

On every viewport, a scroll-triggered collapsing instrument strip
(`HeadlineStrip variant="condensed"`) pins under the header only once the scenario
band has scrolled out of view — an `IntersectionObserver` sentinel just under the
scenario cards drives the transition.

The header itself is `sticky top-0`, bordered, on the Panel surface — never transparent over content.

### Named Rules
**The Numbers-Stay-Visible Rule.** On any viewport, the current DPS readout must remain reachable: visible at the top of the page in the scenario band, and via the scroll-triggered collapsing strip once that band scrolls away. The tweak → flash feedback loop is the product; losing sight of the number breaks it.

## Elevation & Depth

This system is flat by design. Depth is conveyed by two devices only: a 1px `border-line` hairline, and — on cards specifically — a barely-there `shadow-sm` plus `ring-1 ring-foreground/5` that reads as a demarcation, not a lift. Nothing floats, nothing casts a visible drop shadow; popovers and tooltips separate from the page via z-index and a fast fade/zoom transition, not shadow weight.

### Named Rules
**The Flat-By-Default Rule.** No component introduces a drop shadow beyond the Card's near-invisible `shadow-sm`. If a surface needs to read as "above" the page, reach for a border or background-tone step first.

## Shapes

Zero radius, universally. Every rectangle — button, badge, card, input underline, switch track and thumb, accordion row, tooltip popup and its arrow — is a hard-cornered rectangle. The one exception to plain rectangles is the corner-bracket motif (see Components → VATS Bracket Frame), which is additive framing, not a softened corner.

### Named Rules
**The No-Radius Rule.** `border-radius: 0` everywhere, no exceptions, no "just this once for a pill badge" — with one closed, named exception: radio indicators, and nothing else. A `Radio`'s outer control and inner dot stay `rounded-full` because round-vs-square is the only remaining visual cue distinguishing single-select from multi-select once `Checkbox` is square. Any other rounded corner appearing in this system is a regression, not a variant.

## Components

### Buttons
- **Shape:** hard-cornered rectangle (0px radius), 1px transparent border that becomes visible on `outline`/`destructive` variants.
- **Primary:** solid Vault Gold background, `vault-gold-ink` text, `hover:bg-primary/80`. Text is always the Micro Label voice: 12px, semibold, uppercase, `tracking-widest`.
- **Hover / Focus / Active:** hover softens the fill; focus draws a 2px `ring-ring/30` plus a visible border; a press (`:active`) nudges the button down by 1px (`translate-y-px`) — a small mechanical "switch depressed" cue rather than a scale or glow effect.
- **Secondary / Outline / Ghost / Destructive:** Secondary uses the Panel Recede fill; Outline is transparent with a border that fills with Panel Recede on hover; Ghost is borderless until hovered; Destructive uses a translucent Ember Red fill rather than a solid one, reserving solid Ember Red for the Badge's destructive variant.

### Badges
- **Style:** same hard-cornered, uppercase Micro Label voice as buttons, at a smaller `0.625rem` size — reads as a stamped tag rather than a pill. `secondary`/`outline` variants exist for lower-emphasis states (e.g. the "Alpha" mark in the header).

### Cards
- **Corner Style:** 0px, matching the system rule.
- **Background:** Panel, with `ring-1 ring-foreground/5` and `shadow-sm` as the only depth cue.
- **Internal Padding:** a `--card-spacing` custom property (24px default, 20px on `size="sm"`) drives header/content/footer padding uniformly, so nested cards can shrink as a unit.
- **Title:** Micro Label voice (`MicroLabel size="lg"`, via `CardTitle`), `text-lg`, uppercase, `tracking-wider` — the one place Micro Label appears at a larger size than a button/badge. `level={1..3}` renders it as a real heading; the default renders a plain `<div>`.

### Inputs
- **Style:** no box at all — a transparent field with only a bottom border (`border-b-input`), echoing a ledger line rather than a form field. Background stays fully transparent so the field reads as part of the surface, not a widget floating on it.
- **Focus:** the bottom border swaps to `border-b-ring` (Vault Gold); no glow, no full outline.
- **Error / Disabled:** invalid state reddens the bottom border (`aria-invalid:border-b-destructive`); disabled halves opacity and blocks pointer events.

### VATS Bracket Frame (signature)
The system's one deliberate ornament: paired top/bottom or left/right hairline brackets (`.vats-brackets`, 1.5px, masked to leave the corners open) framing an element, borrowed directly from the game's own VATS targeting HUD. At rest the bracket color matches the ordinary border; on the emphasized scenario card, `data-emphasized="true"` switches the bracket color to Vault Gold. Reserved for the two scenario cards in HeadlineStrip — the exact place a player's eye should land first. Do not reuse this framing device on ordinary cards; its power is scarcity.

### Delta Flash Number (signature)
Any headline numeric readout (`DeltaFlash`) is otherwise static ink-colored monospace text. On change, the digits pulse Phosphor Green (increase) or Ember Red (decrease) for 0.9s back to ink, and a small ghost "+4.2%" superscript rises and fades beside it. Color on a number is always transient — a number never sits permanently tinted green or red; the moment it stops moving, it returns to Terminal Cream / Faded Ink. Respects `prefers-reduced-motion` by disabling the animation outright rather than reducing it.

### Derivation Ledger Table (signature)
`MultiplierChainTable` renders the full damage derivation as a dense, indented, monospace-value ledger — base damage → each named contributor → running multiplier → per-hit → fire rate → DPS — with muted rows for zeroed-out/overridden sources and a bordered total row at the bottom of each section. It is deliberately built to look like an itemized printout a theorycrafter could check by hand, not a summarized chart. This is the clearest expression of the terminal metaphor: the UI shows its work.

## Do's and Don'ts

### Do:
- **Do** keep Vault Gold as the only color that means "brand / selected / primary action" — everywhere else, color reports a fact (gain, loss, error).
- **Do** render every quantitative value in Spline Sans Mono with `tabular-nums`; render every label/sentence in Barlow or Barlow Condensed.
- **Do** keep every corner at 0px radius, including one-off components; check new UI against the No-Radius Rule before shipping it.
- **Do** convey depth with a hairline border or the Card's `ring-1 + shadow-sm` combination, never a heavier drop shadow.
- **Do** reserve the VATS corner-bracket frame for the scenario readouts it's thematically tied to.
- **Do** keep the current DPS number on screen at every viewport width (scenario band at the top, scroll-triggered condensed strip once it scrolls away).

### Don't:
- **Don't** add CRT kitsch — no scanlines, bloom/glow, vignette, chromatic aberration, or flicker. The terminal metaphor is structural (density, mono numerals, sharp corners), not a screen-texture effect.
- **Don't** add skeuomorphic chrome — no fake bezels, no plastic/metal texture, no cartoon Vault-Boy iconography standing in for real content.
- **Don't** round a corner anywhere, even "just this once" for a pill-shaped badge or a soft card.
- **Don't** tint a surface or icon a color for mood or decoration; every color use should be traceable to the One Accent Rule or the Functional-Only Color Rule.
- **Don't** let a number sit permanently colored green or red outside of the transient DeltaFlash pulse — color marks a change in progress, not a static verdict.
