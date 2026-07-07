# TODO: napi-rs / WASM Binding for Electron / TS Frontend

## What
Expose the Rust `esm-parser` library to TypeScript via **napi-rs** (Node/Electron) or **wasm-bindgen** (browser/WASM) so a modern frontend can query ESM data without shelling out to the CLI.

## API surface (from POC `lib.rs`)
```rust
Database::open(path)
Database::record_by_formid(form_id)
Database::record_by_edid(edid)
Database::list_by_type(sig, limit)
```

## Target consumers
- Electron/CEF desktop tool replacing Windows-only xEdit UI
- `dps-76` or sibling apps pulling weapon/perk stats directly from ESM

## References
- `esm-parser/src/lib.rs` — public API seam
- Plan: keep all I/O and decoding in the library; bindings are thin wrappers

## Where to implement
- `esm-parser/crates/napi/` or `esm-parser/bindings/` workspace member
- Optional: publish as npm package `@fo76/esm-parser`
