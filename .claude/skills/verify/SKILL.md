---
name: verify
description: Launch and drive dps-76 (Vite/React) in a real browser to confirm a change works end-to-end. Use after any change that touches UI/engine behavior, before considering it done.
---

# Verifying dps-76 end-to-end

This is a client-only Vite/React SPA (no backend) — the whole app is one
page. Drive it with the chrome-devtools MCP tools; don't stop at
tests/lint/build, those only prove CI would pass.

## Launch

```bash
bun run dev         # Vite dev server, base URL "/" (not "/dps-76/" — that's prod only)
```

Runs on `http://localhost:5173/` by default. Open it with the
`chrome-devtools` MCP's `new_page` tool (`url: "http://localhost:5173/"`);
the server takes a couple seconds to cold-start on first request, but
`new_page` blocks until the page loads so no manual wait is needed.

## Drive it

- `take_snapshot` returns the full accessibility tree with stable `uid`s —
  prefer it over screenshots for finding elements and reading state; it's
  cheap and exact (radio `checked`, buttons' visible ΔDPS text, etc.).
- The Build column is one big `Accordion` (`src/components/build/
  BuildColumn.tsx`): Weapon → Special Loadout → Mutations → Conditions →
  Chems/Alcohol → Food & Drink → Magazines → Bobbleheads → Target. Each
  section is a collapsed `button` in the snapshot ("MAGAZINES none",
  "CHEMS, ALCOHOL & ADDICTIONS Overdrive" etc.) — `click` it to expand, then
  re-`take_snapshot` for the newly-revealed `region`'s contents.
  Single-select categories (chem, alcohol, magazine, bobblehead) render as
  `radio` rows with a live ΔDPS % next to each one — clicking an unchecked
  radio both applies the pick AND shows the recomputed deltas for every
  *other* option in that group (cost of switching away from the new pick).
- The stats column's two `button`s ("FREE AIM ... BURST DPS sustained ...",
  "VATS ... BURST DPS sustained ...") carry the live computed numbers in
  their accessible name/text — read them straight from the snapshot instead
  of scripting DOM queries (`evaluate_script` with `textContent.includes`
  matches were unreliable against the rendered button tree; the snapshot's
  StaticText nodes are the reliable source).
- Selections are stored as a share-URL fragment (`#b=1....`, versioned codec
  in `src/lib/persist/codec.ts`) AND localStorage — every dispatch updates
  the URL bar synchronously (visible immediately in the next `take_snapshot`
  or `navigate_page`'s page-list output, no reload needed to observe it).
  To verify persistence: `navigate_page` with `type: "reload"` and confirm
  the same sections/values reappear.
- `list_console_messages` (filter `types: ["error","warn"]`) after each
  significant interaction — the app throws no console noise in normal use,
  so anything here is a real signal.

## Gotchas

- A build starts with a non-empty default loadout (a specific weapon +
  perks + SPECIAL already equipped) — don't assume you're starting from
  "nothing equipped"; read the initial snapshot to see what's already
  active before asserting a delta.
- Radio "None"/"No X" rows never show a ΔDPS badge (by design, mirrors
  `NoneRadioRow` — no `ActionDelta` on the deselect option) — that's
  expected, not a bug.
- ΔDPS previews are relative to the CURRENT state, not zero: after picking
  option A in a single-select group, every other option's preview shows the
  delta of REPLACING A with that option, not the delta of adding it fresh.
  Don't misread a changed number as a bug — recompute what "switching from
  the new active pick" should look like.
