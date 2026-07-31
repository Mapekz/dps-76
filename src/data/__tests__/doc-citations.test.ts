import { describe, it, expect } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, extname, join } from 'path';
import { fileURLToPath } from 'url';

/**
 * Guard against silent doc rot in the two conventions the repo relies on
 * most heavily: `docs/assumptions.md`'s section names being cited verbatim
 * across the codebase (197 citations as of 2026-07-31), and backticked code
 * identifiers in prose docs staying real. Modeled on
 * `move-speed-census.test.ts` — a registry with a test attached.
 *
 * See `.claude/skills/docs-writing/SKILL.md` for the conventions this test
 * enforces and where to fix a failure it reports (usually: fix the doc, not
 * this test — a real rename should update its citations, not grow the
 * allowlist).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..', '..', '..');

/** This test's own source contains example citation strings and the
 * extraction regexes themselves — exclude it from what it scans. */
const SELF = resolve(__dirname, 'doc-citations.test.ts');

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git') continue;
    const full = join(dir, entry);
    if (full === SELF) continue;
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walk(full, exts));
    } else if (exts.includes(extname(entry))) {
      out.push(full);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Assertion 1: every `assumptions.md "<name>"` citation resolves to a live
// heading or bold sub-anchor in docs/assumptions.md.
// ---------------------------------------------------------------------------

const ASSUMPTIONS_PATH = resolve(projectRoot, 'docs/assumptions.md');

/** Matches `assumptions.md "text` or the JSON-escaped `assumptions.md \"text`
 * form, capturing up to the closing quote OR end-of-line — comments word-wrap
 * mid-citation, so a citation split across lines is captured as a truncated
 * prefix. Anchor matching below is therefore prefix-based, not exact. */
const CITATION_RE = /assumptions\.md \\?"([^"\\]*)/g;

function collectCitations(): { file: string; text: string }[] {
  const files = [
    ...walk(resolve(projectRoot, 'src'), ['.ts', '.tsx', '.json']),
    ...walk(resolve(projectRoot, 'scripts'), ['.ts']),
  ];
  const hits: { file: string; text: string }[] = [];
  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    for (const line of content.split('\n')) {
      for (const m of line.matchAll(CITATION_RE)) {
        const text = m[1].trim();
        if (text) hits.push({ file: file.slice(projectRoot.length + 1), text });
      }
    }
  }
  return hits;
}

const STATUS_TAG_PREFIXES = [
  'ESM-PROVEN',
  'USER-CONFIRMED',
  'ASSUMPTION',
  'INFERENCE',
  'MEASURED',
  'CLOSED',
  'RESOLVED',
  'CONFIRMED',
  'GAME FACT',
  'NEEDS MEASUREMENT',
];

function collectAnchors(): string[] {
  const content = readFileSync(ASSUMPTIONS_PATH, 'utf-8');
  const anchors: string[] = [];

  for (const m of content.matchAll(/^#{2,3}\s+(.+)$/gm)) {
    anchors.push(m[1].trim());
  }
  for (const m of content.matchAll(/\*\*([^*]+)\*\*/g)) {
    const text = m[1].trim();
    const upper = text.toUpperCase();
    if (STATUS_TAG_PREFIXES.some((tag) => upper.startsWith(tag))) continue;
    anchors.push(text);
  }
  return anchors;
}

describe('docs/assumptions.md citation guard', () => {
  it('every code/data citation is a prefix of a live heading or bold anchor', () => {
    const anchors = collectAnchors();
    const citations = collectCitations();
    const dead = citations.filter(({ text }) => !anchors.some((anchor) => anchor.startsWith(text)));
    expect(
      dead,
      dead
        .map((d) => `${d.file}: cites "${d.text}", no live anchor starts with that text`)
        .join('\n'),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Assertion 2: backticked code identifiers in docs/, CONTEXT.md, CLAUDE.md
// must be real — either found verbatim somewhere in src/ or scripts/, or
// explicitly allowlisted below (ESM constant names, external tooling,
// formula notation, proposed-but-unbuilt identifiers).
// ---------------------------------------------------------------------------

/** Hand-maintained — every entry needs a reason in its comment. Don't add a
 * real renamed/dead identifier here; fix the citing doc instead. */
const IDENTIFIER_ALLOWLIST = new Set([
  // ESM GMST names — not TS identifiers, never appear in src/scripts as-is.
  'fAVDUnarmedDamageMult',
  'fDamagedStaminaRegenDelay',
  'fHandDamageStrengthMult',
  // External tooling / config keys referenced in prose, not repo code.
  'tsserver',
  'typescript',
  'ignorePatterns',
  // Vitest/Bun mock internals named in a doc-comment explaining a gotcha.
  'actualModule',
  // Triage label value, not a code identifier.
  'wontfix',
  // Named in "Known gaps / deferred" as a not-yet-built CurveInput.
  'lockpickSkill',
  // Formula pseudo-variables — the doc defines these inline as notation for
  // a math expression, not references to real TS identifiers.
  'cycleConstant',
  'bashSec',
]);

const DOC_EXTS = ['.md'];

function collectDocFiles(): string[] {
  return [
    ...walk(resolve(projectRoot, 'docs'), DOC_EXTS),
    resolve(projectRoot, 'CONTEXT.md'),
    resolve(projectRoot, 'CLAUDE.md'),
  ];
}

const IDENT_RE = /`([a-z][a-zA-Z0-9]{4,})`/g;

function collectDocIdentifiers(): { file: string; ident: string }[] {
  const hits: { file: string; ident: string }[] = [];
  for (const file of collectDocFiles()) {
    const content = readFileSync(file, 'utf-8');
    for (const m of content.matchAll(IDENT_RE)) {
      hits.push({ file: file.slice(projectRoot.length + 1), ident: m[1] });
    }
  }
  return hits;
}

function collectCodeSource(): string {
  const files = [
    // Includes .json: generated data (weapons.json etc.) embeds real
    // identifiers — ESM keyword names, bucket names — that a doc may cite.
    ...walk(resolve(projectRoot, 'src'), ['.ts', '.tsx', '.json']),
    ...walk(resolve(projectRoot, 'scripts'), ['.ts']),
  ];
  return files.map((f) => readFileSync(f, 'utf-8')).join('\n');
}

describe('doc identifier guard', () => {
  it('every backticked identifier in docs is real or explicitly allowlisted', () => {
    const codeSource = collectCodeSource();
    const idents = collectDocIdentifiers();
    const dead = idents.filter(
      ({ ident }) => !IDENTIFIER_ALLOWLIST.has(ident) && !codeSource.includes(ident),
    );
    const uniqueDead = [...new Map(dead.map((d) => [`${d.file}:${d.ident}`, d])).values()];
    expect(
      uniqueDead,
      uniqueDead
        .map((d) => `${d.file}: \`${d.ident}\` not found in src/ or scripts/, not allowlisted`)
        .join('\n'),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Assertion 3: every ADR has an H1 assertion and a named "Do not undo this"
// guard section (see .claude/skills/docs-writing/SKILL.md).
// ---------------------------------------------------------------------------

describe('ADR shape guard', () => {
  const adrDir = resolve(projectRoot, 'docs/adr');
  const adrFiles = readdirSync(adrDir).filter((f) => f.endsWith('.md'));

  it.each(adrFiles)('%s has an H1 and a "Do not undo this" guard section', (file) => {
    const content = readFileSync(join(adrDir, file), 'utf-8');
    expect(content, `${file}: missing H1`).toMatch(/^# .+/m);
    expect(content, `${file}: missing "## Do not undo this" section`).toMatch(
      /^## Do not undo this$/m,
    );
  });
});
