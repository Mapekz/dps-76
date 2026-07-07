# TODO: Popular Builds / Preset Scenarios

## What
Add selectable preset builds to quickly load the 3 benchmark scenarios without
manually pasting an N&D URL.

## The 3 benchmark scenarios
1. **Comfort / Sustained** — A well-rounded build with solid DPS that a typical player
   would run day-to-day. Manual aim. VATS when convenient. Moderate crit rate (33%).
2. **Min-maxed VATS** — Maximised VATS crit build. Targets weakpoints 100% of the time.
   50% crit rate. Maximum fire rate.
3. **Min-maxed VATS + Sneak** — Same as above but also sneaking, adding the sneak
   attack damage bonus (+100% base) on first/undetected hits.

## Dependency chain
This feature depends on having all three working first:
- ✅ Correct base damage + fire rate (Week 1)
- [ ] Correct perk data (perk-data-pass.md)
- [ ] VATS crit (vats-crit.md)
- [ ] Sneak (sneak.md)

## UI concept
A "Preset" dropdown or tab-switcher at the top of the Player column. Selecting a preset
loads the appropriate N&D URL (or equivalent perk/config state) for that archetype.
Could also be a side-by-side comparison table showing all 3 at once.
