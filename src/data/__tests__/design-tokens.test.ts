import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Pins DESIGN.md's frontmatter `colors.*` block (dark-mode values — the
 * frontmatter has no light-mode representation) against the real dark-theme
 * custom properties in src/index.css, which is the actual source of truth
 * the app renders from. Without this, the two are hand-synced copies with
 * no test — DESIGN.md's prose Colors section used to restate the same
 * values a third time; that restatement was removed in favor of this pin
 * once it existed (see docs/adr's placement-by-ownership rule — the raw
 * value has exactly one owner, index.css, and everything else links to it).
 *
 * Two `--negative`/`--destructive` and `--secondary`/`--muted` pairs in
 * index.css share a value with what DESIGN.md's frontmatter tracks under one
 * name each (`ember-red`, `panel-recede`) — the mapping below picks one CSS
 * property per frontmatter key; it doesn't assert the pairs stay equal to
 * each other (that's index.css's own internal consistency, out of scope
 * here).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..', '..', '..');

/** DESIGN.md frontmatter color key → the index.css `.dark` custom property
 * that value is supposed to equal. Every entry needs to stay a real mapping
 * — don't add a frontmatter key without pointing it at the CSS property that
 * actually renders it. */
const TOKEN_MAP: Record<string, string> = {
  'terminal-black': '--background',
  'terminal-cream': '--foreground',
  panel: '--card',
  'panel-popover': '--popover',
  'vault-gold': '--primary',
  'vault-gold-ink': '--primary-foreground',
  'panel-recede': '--secondary',
  'muted-ink': '--muted-foreground',
  'accent-panel': '--accent',
  'ember-red': '--destructive',
  'border-line': '--border',
  'input-line': '--input',
  'phosphor-green': '--positive',
};

function readDesignMdColors(): Record<string, string> {
  const content = readFileSync(resolve(projectRoot, 'DESIGN.md'), 'utf-8');
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatter) throw new Error('DESIGN.md: no frontmatter block found');
  const colorsBlock = frontmatter[1].match(/^colors:\n((?:  .+\n?)+)/m);
  if (!colorsBlock) throw new Error('DESIGN.md: no frontmatter `colors:` block found');

  const colors: Record<string, string> = {};
  for (const m of colorsBlock[1].matchAll(/^ {2}([a-z0-9-]+):\s*"([^"]+)"/gm)) {
    colors[m[1]] = m[2];
  }
  return colors;
}

function readIndexCssDarkTokens(): Record<string, string> {
  const content = readFileSync(resolve(projectRoot, 'src/index.css'), 'utf-8');
  const darkBlock = content.match(/\.dark\s*\{([^}]+)\}/);
  if (!darkBlock) throw new Error('src/index.css: no .dark block found');

  const tokens: Record<string, string> = {};
  for (const m of darkBlock[1].matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
    tokens[m[1]] = m[2].trim();
  }
  return tokens;
}

describe('DESIGN.md frontmatter colors pin to src/index.css', () => {
  const designColors = readDesignMdColors();
  const cssTokens = readIndexCssDarkTokens();

  it('every TOKEN_MAP key exists in DESIGN.md frontmatter', () => {
    const missing = Object.keys(TOKEN_MAP).filter((key) => !(key in designColors));
    expect(
      missing,
      `TOKEN_MAP references frontmatter keys that don't exist: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it.each(Object.entries(TOKEN_MAP))(
    'DESIGN.md colors.%s matches src/index.css %s',
    (designKey, cssVar) => {
      const designValue = designColors[designKey];
      const cssValue = cssTokens[cssVar];
      expect(cssValue, `src/index.css .dark has no ${cssVar} custom property`).toBeDefined();
      expect(
        designValue,
        `DESIGN.md colors.${designKey} = "${designValue}" but src/index.css .dark's ${cssVar} = "${cssValue}"`,
      ).toEqual(cssValue);
    },
  );
});
