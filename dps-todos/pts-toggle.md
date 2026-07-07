# TODO: PTS Data Toggle

## What
Re-enable the Live/PTS mode toggle so users can compare damage between current Live
and the PTS (Public Test Server) patch.

## Current state (MVP)
- `GameModeProvider` defaults to `'live'`
- PTS toggle is visually disabled in the Header component
- Both `src/data/live/` and `src/data/pts/` data directories exist
- `src/lib/curve-tables.ts` already loads both live and PTS curvetables (mode-keyed)
- `getPerks(mode)`, `getWeapons(mode)`, etc. in `src/data/index.ts` are already mode-aware

## To re-enable
1. Remove `disabled` from the `<Switch>` in `src/components/layout/Header.tsx`
2. Change the banner/notice text from "Live mode is still being implemented"
3. Keep `defaultMode="live"` in `App.tsx`
4. Ensure PTS weapon data (`src/data/pts/weapons.ts`) is up to date with the latest PTS patch

## Note on curve parity
As of the time of this writing, Live curves = PTS update 68 data (the live curves were
last updated at patch 66). The curve loader already handles this by having separate live
and pts curve directories. Update the pts curves whenever a new PTS patch drops with
curve changes.
