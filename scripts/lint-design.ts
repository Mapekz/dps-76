/**
 * Mechanical enforcement for two of DESIGN.md's Named Rules that had already
 * drifted from enforced to aspirational by the time the 2026-08-10 design
 * critique caught them (`.impeccable/critique/`) — bare-`rounded` radius
 * leaks and sub-floor micro-label font sizes. Neither oxlint nor the
 * `impeccable` skill's `detect.mjs` can be this project's enforcement
 * mechanism: oxlint has no `no-restricted-syntax`-equivalent that can match
 * inside a JSX className string (only `no-restricted-{exports,globals,
 * imports,properties}`), and `detect.mjs` lives outside this repo
 * (`~/.claude/skills/`), so CI has no access to it. This script exists so
 * the same regression can't happen twice.
 *
 * Deliberately grep-based, not an AST/PostCSS pass: the failure mode of a
 * clever check is that nobody keeps it working. Two independent scans:
 *
 *   1. Radius — Tailwind class names in `src/**\/*.{ts,tsx}` `className`
 *      strings that aren't neutralized by index.css's `--radius-*` tokens
 *      (bare `rounded`, `rounded-{sm,md,lg,xl,2xl,3xl,4xl}` with an
 *      arbitrary value, `rounded-[...]`), plus raw `border-radius` in
 *      `.css` files — the one leak (`App.css`'s old scrollbar thumb) that a
 *      className-only check can never see. `rounded-full` is allowlisted
 *      ONLY in `ui/radio.tsx` — DESIGN.md's one documented No-Radius Rule
 *      exception (see radio.tsx's doc comment).
 *   2. Typography — `text-[Npx]` / `text-[N.NNNrem]` arbitrary values below
 *      the 10px Micro Label floor (DESIGN.md "Hierarchy").
 *   3. Custom `--text-*` @theme tokens whose name isn't shaped like a
 *      Tailwind t-shirt size (see check 3's comment for why this matters —
 *      it's a tailwind-merge trap, not a style preference).
 *
 *   bun run lint:design
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const SRC = join(ROOT, 'src');

const RADIUS_ALLOWLIST = new Set([join(SRC, 'components/ui/radio.tsx')]);

interface Finding {
  file: string;
  line: number;
  message: string;
  snippet: string;
}

const findings: Finding[] = [];

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walk(full, exts));
    } else if (exts.some((ext) => entry.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

function lineOf(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

// --- string-literal extraction ---------------------------------------------

// Both checks below only make sense INSIDE a quoted/templated string (a
// Tailwind className value) — never against raw source text. Without this,
// the word "rounded" in a comment ("rounded to 2 decimal places") or as a
// plain identifier (`const rounded = Math.round(...)`) reads as a false
// positive; `src/lib/format.ts` and `player-stats.ts` have exactly that
// shape and aren't UI code at all.
const STRING_LITERAL_PATTERN =
  /"([^"\\\n]*(?:\\.[^"\\\n]*)*)"|'([^'\\\n]*(?:\\.[^'\\\n]*)*)'|`([^`\\]*(?:\\.[^`\\]*)*)`/g;

function forEachStringLiteral(content: string, fn: (text: string, startIndex: number) => void) {
  for (const match of content.matchAll(STRING_LITERAL_PATTERN)) {
    const text = match[1] ?? match[2] ?? match[3] ?? '';
    // +1 to skip the opening quote/backtick itself.
    fn(text, (match.index ?? 0) + 1);
  }
}

// --- 1a. Radius leaks in .ts/.tsx className strings -----------------------

// Bare `rounded` (no suffix — Tailwind's un-remapped 0.25rem default) and
// `rounded-{step}` where step is a size Tailwind ships arbitrary/default
// values for. Any `-none` compound (`rounded-none`, `rounded-t-none`, ...)
// is always fine — that's the whole point of the rule. Every other named
// step is neutralized to 0 only because index.css's `@theme inline` block
// says so — this check exists so nobody removes that neutralization for one
// step and ships a silent regression.
const ROUNDED_PATTERN =
  /\brounded(-(?:none|xs|sm|md|lg|xl|2xl|3xl|4xl|full|t|r|b|l|tl|tr|bl|br)(-(?:none|xs|sm|md|lg|xl|2xl|3xl|4xl|full))?)?\b/g;

function checkRadiusInSource(file: string, content: string) {
  const isAllowlisted = RADIUS_ALLOWLIST.has(file);
  forEachStringLiteral(content, (text, startIndex) => {
    for (const match of text.matchAll(ROUNDED_PATTERN)) {
      const full = match[0];
      if (full.endsWith('-none')) continue;
      const absoluteIndex = startIndex + (match.index ?? 0);
      const isFull = full === 'rounded-full' || full.endsWith('-full');
      if (isFull) {
        if (isAllowlisted) continue;
        findings.push({
          file,
          line: lineOf(content, absoluteIndex),
          message: `'${full}' is not allowlisted — DESIGN.md's No-Radius Rule has exactly one documented exception (ui/radio.tsx)`,
          snippet: full,
        });
        continue;
      }
      // Any other rounded-* utility (or bare `rounded`) is only safe
      // because index.css's @theme block currently maps every named step to
      // 0rem. Flag it so a future edit to that block (or a typo'd new step)
      // can't silently reintroduce a visible radius without a corresponding
      // token.
      findings.push({
        file,
        line: lineOf(content, absoluteIndex),
        message: `'${full}' relies on index.css's --radius-* tokens staying at 0 — use 'rounded-none' to make the intent explicit and regression-proof`,
        snippet: full,
      });
    }
  });
}

// --- 1b. Raw border-radius in .css files -----------------------------------

const CSS_RADIUS_PATTERN = /border-radius\s*:\s*([^;]+);/g;

function checkRadiusInCss(file: string, content: string) {
  for (const match of content.matchAll(CSS_RADIUS_PATTERN)) {
    const value = match[1].trim();
    if (value === '0' || value === '0px' || value === '0rem') continue;
    if (value.includes('var(--radius')) continue; // token-driven, already 0
    findings.push({
      file,
      line: lineOf(content, match.index),
      message: `raw 'border-radius: ${value}' bypasses the design-token layer entirely`,
      snippet: match[0],
    });
  }
}

// --- 2. Sub-floor micro-label font sizes -----------------------------------

// DESIGN.md's Hierarchy section documents Micro Label as 10–12px; the Badge
// spec and this project's `--text-3xs` token both land on the 10px floor.
// Anything below that (the slider.tsx 9px regression the critique caught)
// is a genuine violation, not a documentation disagreement.
const FONT_SIZE_PATTERN = /text-\[(\d+(?:\.\d+)?)(px|rem)\]/g;
const MICRO_FLOOR_PX = 10;

function checkFontSize(file: string, content: string) {
  forEachStringLiteral(content, (text, startIndex) => {
    for (const match of text.matchAll(FONT_SIZE_PATTERN)) {
      const [full, num, unit] = match;
      const px = unit === 'rem' ? parseFloat(num) * 16 : parseFloat(num);
      if (px < MICRO_FLOOR_PX) {
        const absoluteIndex = startIndex + (match.index ?? 0);
        findings.push({
          file,
          line: lineOf(content, absoluteIndex),
          message: `'${full}' (${px}px) is below the 10px Micro Label floor (DESIGN.md "Hierarchy") — use 'text-3xs' (0.625rem) or larger`,
          snippet: full,
        });
      }
    }
  });
}

// --- 3. Non-t-shirt-size custom --text-* @theme tokens ---------------------

// tailwind-merge's `text-*` resolver only classifies a value as font-size
// when it parses as an (optional numeric prefix +) t-shirt size (`xs`,
// `2xs`, `3xs`, ...) or an arbitrary length — anything else (a descriptive
// word, like the original `--text-micro`/`--text-section`) falls through to
// its text-COLOR group instead. A custom @theme token with a non-t-shirt
// name then silently loses (or evicts) a real color class wherever `cn()`
// merges them: `cn('text-positive', 'text-micro')` dropped `text-positive`
// entirely, which is exactly how combobox ΔDPS text and every Badge variant
// lost their color/size once already. `--text-shadow-*` is a different
// property namespace (text-shadow, not font-size) and is excluded.
const TEXT_TOKEN_PATTERN = /--text-(?!shadow-)([a-zA-Z0-9.]+?)(?:--line-height)?\s*:/g;
const TSHIRT_SIZE_PATTERN = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/;

function checkTextTokenNaming(file: string, content: string) {
  const seen = new Set<string>();
  for (const match of content.matchAll(TEXT_TOKEN_PATTERN)) {
    const name = match[1];
    if (seen.has(name)) continue; // one finding per token, not per --line-height companion line
    seen.add(name);
    if (TSHIRT_SIZE_PATTERN.test(name)) continue;
    findings.push({
      file,
      line: lineOf(content, match.index ?? 0),
      message: `'--text-${name}' isn't shaped like a Tailwind t-shirt size — tailwind-merge will treat 'text-${name}' as a text-COLOR utility, silently dropping/evicting real color classes in cn() calls; rename to a t-shirt-shaped step (e.g. '2xs'/'3xs')`,
      snippet: match[0],
    });
  }
}

// --- run ---------------------------------------------------------------

// .tsx only, not .ts: Tailwind classNames only ever appear on JSX elements
// in this codebase (verified — no plain .ts file holds a real className
// string constant), so scanning .ts too only ever finds the English word
// "rounded" in prose (a comment, a doc-string, a test description) — exactly
// the false positive this script hit on its own new format.test.ts.
for (const file of walk(SRC, ['.tsx'])) {
  const content = readFileSync(file, 'utf8');
  checkRadiusInSource(file, content);
  checkFontSize(file, content);
}

for (const file of walk(SRC, ['.css'])) {
  const content = readFileSync(file, 'utf8');
  checkRadiusInCss(file, content);
  checkTextTokenNaming(file, content);
}

if (findings.length === 0) {
  console.log('lint:design — clean (0 findings).');
  process.exit(0);
}

findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
console.error(`lint:design — ${findings.length} finding${findings.length === 1 ? '' : 's'}:\n`);
for (const f of findings) {
  console.error(`  ${relative(ROOT, f.file)}:${f.line}  ${f.message}`);
}
console.error('');
process.exit(1);
