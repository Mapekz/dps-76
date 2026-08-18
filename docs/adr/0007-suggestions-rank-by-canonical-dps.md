# Suggestions rank and display on the canonical DPS metric

`SuggestionsPanel` (`src/lib/suggest/evaluate.ts`) ranks every candidate on
the emphasized scenario's canonical duty-cycle blend
`uptime·V + (1−uptime)·F` — the same `sustainedDps` the headline,
`HeadlineStrip`, auto-emphasis, `ActionDelta`, `DiffTooltip`, and printed
suggestion deltas all show. One number everywhere: a preview can never
contradict what the user sees after clicking Apply.

This ADR previously split ranking from display: `ScenarioHeadline` carried a
second field (`uptime × V`, pause counted as zero) as the VATS ranking
objective while the headline stayed on the canonical blend. Measured on a real
VATS build (uptime 0.101, window metric 25.62 vs headline 233.44) the
~10× smaller denominator distorted every percentage and hid the best upgrades:

| Suggestion | Panel printed | Real headline change |
|---|---|---|
| ★★ Powered ×5 | +240.03% | +2.28% |
| ★★ Agility ×5 | +118.22% | +1.13% |
| Action Boy/Girl 3 | +70.92% | +0.68% |

`topSuggestions` filtered `primaryDeltaPct <= 0`, so damage receivers that
drain AP faster vanished despite large headline gains — e.g. Mod: Prime
Automatic Receiver (+53.63% headline, −18.7% window) and Mod: Powerful
Automatic Receiver (+53.52% / −20.8%) never appeared. The prior revision's
canonical-delta guard (`delta[metric].sustainedDps > 0`) existed because the
window metric could rise while canonical DPS fell; ranking on `sustainedDps`
collapses that guard into the metric itself and it was removed as redundant,
not dropped.

The countervailing concern — optimizing canonical VATS DPS at low uptime is
mostly optimizing free aim (~92% of the blend at 8% uptime), burying
AP-economy levers — is real but not fixable by a second score. The engine
models the pathway correctly (crit fill is per-shot, so `V` carries crit
cadence and `(V − F)·Δuptime` is "more uptime → more crits per second"), yet
a single AP lever is worth 1–3% against a receiver's +73% and cannot win a
shared ranked list. Resolution: every printed number stays canonical; uptime
levers earn visibility through layout (a dedicated "VATS uptime" panel
section — dev-only layout scaffolding in `SuggestionsPanel.tsx` pending a
converged choice, not a shipped feature) rather than a distorted metric.
`ScenarioHeadline.uptime` exists solely to classify which suggestions are
uptime levers.

## Do not undo this

A future reviewer might reasonably want to rank on unblended VATS sustained
DPS (`V`) instead, to "simplify" by dropping the uptime factor entirely —
don't. Uptime does not appear in `sustain.sustainedDps` at all, so every
AP-economy lever (Action Boy, AP-cost receivers, `apMax`/`apRegenFlat`
consumables) would score exactly `0` and get filtered by `topSuggestions`'s
`<= 0` check, making the panel structurally incapable of ever suggesting
more uptime.

Or reintroduce a ranking objective that is not the number the headline
displays — don't. Visibility problems get solved in layout; a score that is
not the user's DPS is not a fix.
