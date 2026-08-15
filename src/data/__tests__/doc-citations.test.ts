import { describe, it, expect } from 'bun:test';
import { readFileSync, readdirSync, statSync, lstatSync } from 'fs';
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
    // Skip symlinks — `.claude/skills/{shadcn,migrate-radix-to-base}` are
    // symlinks into `.agents/skills/`, vendored third-party skill docs
    // hash-pinned by skills-lock.json and off-limits for this guard (and
    // for editing generally). `lstatSync` (not `statSync`) is required to
    // detect the symlink itself rather than following it.
    if (lstatSync(full).isSymbolicLink()) continue;
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
 * form; the citation text itself is read by `readWrappedCitation` below,
 * which joins comment-wrapped continuation lines rather than truncating at
 * the first line break. */
const CITATION_START_RE = /assumptions\.md \\?"/g;

/**
 * Reads a citation's text starting right after the opening quote, joining
 * comment-wrapped continuation lines (a leading `*` or `//` on the next
 * line) so a citation split across lines by prose word-wrap is captured in
 * full instead of being truncated at the first line break — the previous
 * end-of-line cutoff is what let short truncated prefixes (e.g. bare
 * "Armor") pass by matching almost any anchor. Stops at the closing quote,
 * or at a line that isn't a comment continuation (code resumed, or a blank
 * line), or after a generous length cap — whichever comes first.
 */
function readWrappedCitation(content: string, start: number): string {
  let i = start;
  let out = '';
  while (i < content.length && out.length < 300) {
    const ch = content[i];
    // Closing delimiter: a bare `"` (comment source), or `\"` (the escaped
    // quote JSON string values use, e.g. `.json` fixtures under src/) — in
    // the latter case the backslash belongs to the delimiter, not the text.
    if (ch === '"') break;
    if (ch === '\\' && content[i + 1] === '"') break;
    if (ch === '\n') {
      let j = i + 1;
      while (j < content.length && (content[j] === ' ' || content[j] === '\t')) j++;
      if (content[j] === '*') {
        j += 1;
        if (content[j] === ' ') j += 1;
      } else if (content[j] === '/' && content[j + 1] === '/') {
        j += 2;
        if (content[j] === ' ') j += 1;
      } else {
        break;
      }
      out += ' ';
      i = j;
      continue;
    }
    out += ch;
    i++;
  }
  // Collapse runs of whitespace: a wrapped line's own trailing space plus
  // the space this function inserts at the join point can otherwise leave
  // a double space that fails to match the doc's single-spaced heading text.
  return out.trim().replace(/\s+/g, ' ');
}

function collectCitations(): { file: string; text: string }[] {
  const files = [
    ...walk(resolve(projectRoot, 'src'), ['.ts', '.tsx', '.json']),
    ...walk(resolve(projectRoot, 'scripts'), ['.ts']),
  ];
  const hits: { file: string; text: string }[] = [];
  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    for (const m of content.matchAll(CITATION_START_RE)) {
      const text = readWrappedCitation(content, m.index + m[0].length);
      if (text) hits.push({ file: file.slice(projectRoot.length + 1), text });
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
];

/**
 * Only *leading* bold on a bullet or table-row line (`- **Anchor** — ...` /
 * `| **Anchor** | ... |`) and H2/H3 headings count as anchors — a bare
 * `**bold**` elsewhere in the line (a mid-sentence "see **Some Section**"
 * cross-reference) does NOT, because collecting those meant a deleted
 * section stayed "valid" as long as any stray cross-reference to it survived
 * elsewhere in the file. Table rows count because the "Hand-supplied values"
 * table is a registry in the same sense bullets are (`| **Tenderizer** |
 * ... |`), just in table form. This also makes the `STATUS_TAG_PREFIXES`
 * filter redundant for these lines (the leading bold is always the anchor,
 * never its status tag), but it's kept as a defensive filter in case a line
 * ever leads with the tag instead.
 */
function collectAnchors(): string[] {
  const content = readFileSync(ASSUMPTIONS_PATH, 'utf-8');
  const anchors: string[] = [];

  for (const m of content.matchAll(/^#{2,3}\s+(.+)$/gm)) {
    anchors.push(m[1].trim());
  }
  for (const m of content.matchAll(/^(?:-|\|)\s*\*\*([^*]+)\*\*/gm)) {
    const text = m[1].trim();
    const upper = text.toUpperCase();
    if (STATUS_TAG_PREFIXES.some((tag) => upper.startsWith(tag))) continue;
    anchors.push(text);
  }
  return anchors;
}

/**
 * Below this length, prefix matching is nearly unfalsifiable — a short
 * citation like bare "Armor" is a prefix of almost any anchor that happens
 * to start with the same word, so it can never actually fail. Citations
 * this short must match an anchor exactly instead of merely prefixing one;
 * a citation that trips this is too vague to know which section it means
 * and should be rewritten with more of the section's name.
 */
const MIN_PREFIX_CITATION_LENGTH = 12;

describe('docs/assumptions.md citation guard', () => {
  it('every code/data citation resolves to a live heading or bold anchor', () => {
    const anchors = collectAnchors();
    const citations = collectCitations();
    const dead = citations.filter(({ text }) => {
      if (text.length < MIN_PREFIX_CITATION_LENGTH) return !anchors.includes(text);
      return !anchors.some((anchor) => anchor.startsWith(text));
    });
    expect(
      dead,
      dead
        .map(
          (d) =>
            `${d.file}: cites "${d.text}", no live anchor ${d.text.length < MIN_PREFIX_CITATION_LENGTH ? 'exactly matches it (too short to prefix-match safely)' : 'starts with that text'}`,
        )
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
  // Triage label value, not a code identifier.
  'wontfix',
  // Formula pseudo-variable — the doc defines this inline as notation for a
  // math expression, not a reference to a real TS identifier.
  'bashSec',
]);

const DOC_EXTS = ['.md'];

/**
 * Previously scanned only docs/, CONTEXT.md, CLAUDE.md — DESIGN.md,
 * README.md, and the `.claude/skills` procedure docs (SKILL.md files) went
 * unchecked, which is exactly how a stale DESIGN.md claim and a stale
 * README.md claim each survived undetected (see the contradiction fixes in
 * this same change).
 */
function collectDocFiles(): string[] {
  return [
    ...walk(resolve(projectRoot, 'docs'), DOC_EXTS),
    ...walk(resolve(projectRoot, '.claude/skills'), DOC_EXTS),
    resolve(projectRoot, 'CONTEXT.md'),
    resolve(projectRoot, 'CLAUDE.md'),
    resolve(projectRoot, 'DESIGN.md'),
    resolve(projectRoot, 'README.md'),
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
