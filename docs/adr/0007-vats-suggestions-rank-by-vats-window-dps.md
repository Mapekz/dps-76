# Suggestions rank VATS candidates by VATS-Window DPS, not the canonical blend

`SuggestionsPanel` (`src/lib/suggest/evaluate.ts`) previously ranked every
candidate on the VATS scenario's canonical duty-cycle blend
`uptime·V + (1−uptime)·F` — the same value as `sustainedDps` on the headline.
That denominator is mostly free-aim DPS, so VATS-only gains (crit damage,
Better Criticals, crit rate) got diluted by `uptime` and buried under generic/
free-aim suggestions — even when the player emphasized the VATS card,
declaring VATS as their intent.

The fix: `ScenarioHeadline` gained a second field, `windowDps`
(`uptime × VATS sustained`, pause counted as zero, via the existing
`apLimitedDps` primitive with its default `downtimeFallbackDps = 0`), and
`evaluateSuggestions`/`topSuggestions` in `src/lib/suggest/evaluate.ts`
now rank on `windowDps` instead of `sustainedDps`. The canonical
`sustainedDps` field, and everything that reads it directly (the headline,
`HeadlineStrip`, auto-emphasis in `useScenarioResults.ts`, the vs-target
blend, `DiffTooltip`), is untouched.

`topSuggestions`'s `positive` filter additionally requires
`s.delta[report.metric].sustainedDps > 0` — the canonical-delta guard —
because a candidate can raise `windowDps` while lowering canonical achieved
DPS (an AP-cost receiver that buys uptime at the cost of enough per-shot
damage). A suggestion must never be shown if applying it would drive the
headline down.

## Do not undo this

Or rank on unblended VATS sustained DPS (`V`) instead, to "simplify" by
dropping the uptime factor entirely — don't. Uptime does not appear in
`sustain.sustainedDps` at all, so every AP-economy lever (Action Boy,
AP-cost receivers, `apMax`/`apRegenFlat` consumables) would score exactly
`0` and get filtered by `topSuggestions`' `<= 0` check, making the panel
structurally incapable of ever suggesting more uptime.

Or drop the canonical-delta guard in `topSuggestions` to "just trust
windowDps" — don't. `d(windowDps) = V·d(uptime) + uptime·dV`, so a
candidate can score positive on `windowDps` while canonical DPS actually
falls; without the guard, clicking Apply on a top-ranked suggestion could
visibly lower the headline, which breaks the panel's basic promise.
