# Stack sliders and suggestions default to sustained averages

Scoring stack mechanics at max stacks over-recommended Bullet Storm on weapons
that cannot ramp it (low mag / slow fire rate; accrual
`(proj+ammoPerShot−1)/30` with full loss on reload) and non-GSM Onslaught had
no decay model at all. Display and the suggestion sweep must agree or applied
suggestions contradict their promised delta.

Simulated sustained values become the engine-wide default. The `−1` sentinel
is redefined to "auto = Sustained Stacks". The `bulletStormAverageMode`
toggle is deleted rather than adding a second toggle for Onslaught. Manual
slider pins remain and win over the sim. GSM reverse stays always-auto.

Old share-URLs carrying the deleted toggle field decode by ignoring it (they
shift to auto). URLs with a pinned slider + toggle-on formerly let the
average override the pin; now the pin wins.

## Do not undo this

A future reviewer might reasonably want to re-redefine the `−1` sentinel
again (e.g. back to "auto = max stacks", or to add a per-mechanic toggle
mirroring the deleted `bulletStormAverageMode`) — don't. Display and the
suggestion sweep share this same default by construction; splitting them
reintroduces the original bug (a suggestion's promised delta stops matching
what the build actually shows), and re-redefining the sentinel a second time
breaks the URL semantics of every share-link encoded under the current
meaning.
