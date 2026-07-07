# TODO: Write Support (ESM/ESP Editing)

## What
Extend the parser from read-only to read/write: modify subrecord payloads, update record headers, recompress when needed, and serialize back to disk.

## Why (deferred from ESM parser POC)
POC is intentionally read-only — mmap parse, decode, and index only. xEdit's full edit pipeline (change tracking, conflict detection, ITM/UDR cleaning) is out of scope.

## Minimum viable write path
1. Rebuild record data blob from modified subrecords
2. Apply zlib compression when `0x00040000` compressed flag is set
3. Update `dataSize` in record header
4. Handle XXXX oversized subrecords on serialize

## Not in initial write scope
- Multi-plugin override resolution
- Reference building / FormID allocation (`nextObjectID`)
- CK compatibility validation

## References
- `TES5Edit/Core/wbImplementation.pas` — compress (~10279), subrecord XXXX (~16177)
- `esm-parser/src/compress.rs` — needs zlib **compress** alongside decompress

## Where to implement
- `esm-parser/src/writer.rs` — new module
- Guard behind feature flag `write` in Cargo.toml until stable
