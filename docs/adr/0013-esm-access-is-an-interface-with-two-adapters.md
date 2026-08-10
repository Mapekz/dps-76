# ESM access is an interface with two adapters, not a concrete client

Every extractor reaches the game data through one object: a client that shells
out to the `esm` CLI (`scripts/extract/esm-client.ts`, `execFile` hardwired, a
warm daemon making repeated `get`s cheap). That client was a concrete class with
no interface, so extractor tests could not name what they were substituting.

The result was 47 `as unknown as EsmClient` casts across 13 files (16 in
`extract-omods.test.ts`, 10 in `normalize.test.ts`), reached through five
differently-named hand-rolled stub builders that each re-implemented
`get`/`list`/`refs`/`resolveEdid`/`bulkGet` fallbacks slightly differently.
Every one of those casts was a test lying to the type system about a shape it
had reconstructed by hand.

Decision: **`EsmSource` is the interface; the CLI client and the in-memory fake
are its two adapters.**

- `EsmSource` (`scripts/extract/esm-client.ts`) declares the six methods
  extractors actually use. `EsmClient` `implements` it and is otherwise
  unchanged — same daemon, same `execFile`.
- `createInMemoryEsmSource` (`scripts/extract/esm-source-fake.ts`) is the
  second adapter and the only one tests use. It takes records keyed by form id
  *or* editor id, rows for `list`/`search`, refs with a `'throw'` sentinel for
  error paths, and three extension points the migration needed
  (`getFallback`, `resolveEdidMap`, `resolveEdidFallback`).
- Extractors and their helpers take `EsmSource`, never `EsmClient`. A signature
  naming the concrete class is a bug; `run-all.ts` is the one place that
  constructs the real client.

Two adapters is what makes this a real seam rather than a hypothetical one —
the fake is not a testing convenience bolted onto a single implementation, it is
the second thing the interface exists to describe.

## Do not undo this

Don't reintroduce a per-test stub object, however small. The whole point is that
a change to the record protocol updates one adapter instead of 47 casts; a
fresh hand-rolled stub re-opens exactly that. If the fake can't express what a
test needs, extend the fake — that is what `getFallback` / `resolveEdidMap` /
`resolveEdidFallback` are.

Don't widen `EsmSource` to mirror `EsmClient`'s full surface "for symmetry."
The interface is deliberately the subset extractors call; every method added is
a method the fake must implement honestly.

Don't push write support onto it. `FO76-Tools/esm` is read-only by design and
that is a permanent scope decision upstream, not a gap to fill here.
