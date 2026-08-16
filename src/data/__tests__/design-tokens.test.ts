import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  sectionLabelVariants,
  microLabelVariants,
  bodyVariants,
  readoutVariants,
} from '@/components/ui/typography-variants';

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

/**
 * Pins DESIGN.md frontmatter's `typography:` block against the classes
 * src/components/ui/typography.tsx actually emits — the same asymmetry as
 * the colors pin above, minus this test: the `colors:` block stayed in
 * sync because it was pinned; `typography:` wasn't pinned by anything and
 * the Section Label voice alone had drifted into 13 different class
 * strings across 21 sites before typography.tsx existed (see that file's
 * doc-comment).
 *
 * Each Tailwind utility used by typography.tsx is mapped to the literal
 * computed CSS value it resolves to (from node_modules/tailwindcss/theme.css's
 * default scale, plus this project's --font-* / --text-* tokens in
 * src/index.css) — not re-derived at runtime, so a Tailwind version bump
 * that changes a default scale value would need this map updated by hand,
 * same tradeoff the colors pin makes by hand-copying TOKEN_MAP.
 *
 * Readout is documented as a legitimate range ("500, 14–24px" — DESIGN.md's
 * Hierarchy section, not one fixed size), so only its `md` variant (14px)
 * is pinned against the frontmatter's single representative value; `sm`/`lg`
 * are the documented range, not drift.
 */

const FONT_FAMILY: Record<string, string> = {
  'font-condensed': "'Barlow Condensed', 'Barlow', sans-serif",
  'font-mono': "'Spline Sans Mono Variable', ui-monospace, monospace",
  // No font-family utility present on a voice → it inherits body's
  // `font-sans` (src/index.css's `@layer base` rule), which is this value.
  inherited: "'Barlow', ui-sans-serif, system-ui, sans-serif",
};

const FONT_SIZE: Record<string, string> = {
  'text-3xs': '10px',
  'text-2xs': '11px',
  'text-xs': '12px',
  'text-sm': '14px',
  'text-2xl': '24px',
};

const FONT_WEIGHT: Record<string, number> = {
  'font-normal': 400,
  'font-medium': 500,
  'font-semibold': 600,
};

const LINE_HEIGHT: Record<string, number> = {
  'leading-none': 1,
  'leading-tight': 1.25,
  'leading-relaxed': 1.625,
};

const LETTER_SPACING: Record<string, string> = {
  'tracking-widest': '0.1em',
};

/** Derive the {fontFamily, fontSize, fontWeight, lineHeight, letterSpacing}
 * a class string resolves to, in the same shape as a DESIGN.md typography
 * frontmatter entry. */
function deriveVoice(classes: string) {
  const tokens = classes.split(/\s+/);
  const find = (map: Record<string, unknown>) => tokens.find((t) => t in map);

  const familyToken = find(FONT_FAMILY);
  const sizeToken = find(FONT_SIZE);
  const weightToken = find(FONT_WEIGHT);
  const leadingToken = find(LINE_HEIGHT);

  const trackingArbitrary = tokens.find((t) => /^tracking-\[[\d.]+em]$/.test(t));
  const trackingNamed = find(LETTER_SPACING);
  const letterSpacing = trackingArbitrary
    ? trackingArbitrary.slice('tracking-['.length, -1)
    : trackingNamed
      ? LETTER_SPACING[trackingNamed]
      : 'normal';

  return {
    fontFamily: familyToken ? FONT_FAMILY[familyToken] : FONT_FAMILY.inherited,
    fontSize: sizeToken ? FONT_SIZE[sizeToken] : undefined,
    fontWeight: weightToken ? FONT_WEIGHT[weightToken] : undefined,
    lineHeight: leadingToken ? LINE_HEIGHT[leadingToken] : undefined,
    letterSpacing,
  };
}

function readDesignMdTypography(): Record<string, Record<string, string | number>> {
  const content = readFileSync(resolve(projectRoot, 'DESIGN.md'), 'utf-8');
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatter) throw new Error('DESIGN.md: no frontmatter block found');
  const typographyBlock = frontmatter[1].match(/^typography:\n((?:  .+\n?)+)/m);
  if (!typographyBlock) throw new Error('DESIGN.md: no frontmatter `typography:` block found');

  const voices: Record<string, Record<string, string | number>> = {};
  let currentVoice: string | null = null;
  for (const line of typographyBlock[1].split('\n')) {
    const voiceMatch = line.match(/^ {2}([a-z-]+):\s*$/);
    if (voiceMatch) {
      currentVoice = voiceMatch[1];
      voices[currentVoice] = {};
      continue;
    }
    const propMatch = line.match(/^ {4}(\w+):\s*(.+)$/);
    if (propMatch && currentVoice) {
      const raw = propMatch[2];
      const quoted = raw.match(/^"(.*)"$/);
      voices[currentVoice][propMatch[1]] = quoted ? quoted[1] : Number(raw);
    }
  }
  return voices;
}

describe("DESIGN.md frontmatter typography pins to typography.tsx's rendered voices", () => {
  const designTypography = readDesignMdTypography();

  const VOICE_MAP: Record<string, ReturnType<typeof deriveVoice>> = {
    'section-label': deriveVoice(sectionLabelVariants({ size: 'default' })),
    'micro-label': deriveVoice(microLabelVariants({ size: 'default' })),
    body: deriveVoice(bodyVariants()),
    readout: deriveVoice(readoutVariants({ size: 'md' })),
  };

  it('every DESIGN.md typography key has a mapped voice', () => {
    const missing = Object.keys(designTypography).filter((key) => !(key in VOICE_MAP));
    expect(
      missing,
      `DESIGN.md typography keys with no mapped voice: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it.each(Object.keys(VOICE_MAP))('DESIGN.md typography.%s matches typography.tsx', (voice) => {
    const spec = designTypography[voice];
    expect(spec, `DESIGN.md frontmatter has no typography.${voice} block`).toBeDefined();
    const rendered = VOICE_MAP[voice];
    expect(rendered.fontFamily, `${voice}.fontFamily`).toEqual(spec.fontFamily as string);
    expect(rendered.fontSize, `${voice}.fontSize`).toEqual(spec.fontSize as string);
    expect(rendered.fontWeight, `${voice}.fontWeight`).toEqual(spec.fontWeight as number);
    expect(rendered.lineHeight, `${voice}.lineHeight`).toEqual(spec.lineHeight as number);
    expect(rendered.letterSpacing, `${voice}.letterSpacing`).toEqual(spec.letterSpacing as string);
  });
});
