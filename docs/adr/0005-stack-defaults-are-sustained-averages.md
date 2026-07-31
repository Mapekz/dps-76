# Stack sliders and suggestions default to sustained averages

## Context

Scoring stack mechanics at max stacks over-recommended Bullet Storm on weapons
that cannot ramp it (low mag / slow fire rate; accrual
`(proj+ammoPerShot−1)/30` with full loss on reload) and non-GSM Onslaught had
no decay model at all. Display and suggestion sweep must agree or applied
suggestions contradict their promised delta.

## Decision

Simulated sustained values become the engine-wide default. The `−1` sentinel is
redefined to "auto = Sustained Stacks". The `bulletStormAverageMode` toggle is
deleted rather than adding a second toggle for Onslaught. Manual slider pins
remain and win over the sim. GSM reverse stays always-auto.

## Consequences

Old share-URLs carrying the deleted toggle field decode by ignoring it (they
shift to auto). URLs with a pinned slider + toggle-on formerly let the average
override the pin, now the pin wins. Re-redefining the sentinel later would
re-break URL semantics, which is why this is an ADR.
