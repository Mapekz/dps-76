import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import type { GameMode } from '../../src/types';
import type { GeneratedMeta } from '../../src/types/generated';
import { EsmClient } from './esm-client';
import {
  createPassContext,
  foldIntoMeta,
  KNOWN_EXTRACTORS,
  resolveRunOrder,
  writeOutput,
  type ExtractorName,
} from './pass';
import { PASSES } from './passes';
import { classifyUnresolved, summarizeUnresolvedClassification } from './unresolved-classification';

async function main() {
  const { values } = parseArgs({
    options: {
      esm: { type: 'string' },
      mode: { type: 'string', default: 'live' },
      only: { type: 'string' },
      'strict-unresolved': { type: 'boolean', default: false },
    },
  });

  const esmPath = values.esm ?? process.env.FO76_ESM_PATH;
  if (!esmPath) {
    console.error(
      'Usage: bun run extract --esm <path-to-SeventySix.esm> [--mode live|pts] [--only weapons,...] [--strict-unresolved]',
    );
    console.error('(or set the FO76_ESM_PATH env var to omit --esm)');
    process.exit(1);
  }
  const mode = values.mode!;
  if (mode !== 'live' && mode !== 'pts') {
    console.error(`Invalid --mode "${mode}" (expected live or pts)`);
    process.exit(1);
  }
  const requested = values.only
    ? (values.only.split(',').map((s) => s.trim()) as ExtractorName[])
    : [...KNOWN_EXTRACTORS];
  for (const name of requested) {
    if (!KNOWN_EXTRACTORS.includes(name)) {
      console.error(`Unknown extractor "${name}" (known: ${KNOWN_EXTRACTORS.join(', ')})`);
      process.exit(1);
    }
  }
  // Topological order over `requested` PLUS the transitive closure of every
  // selected pass's hard `needs` (pass.ts) — e.g. `--only uniques` alone now
  // pulls in weapons+omods rather than silently reading a possibly-stale
  // omods.json off disk. `optionalNeeds` are never auto-pulled; those passes
  // degrade gracefully instead (see pass.ts's ExtractionPass doc-comment).
  const runOrder = resolveRunOrder(PASSES, requested);

  const outDir = path.join(import.meta.dirname, '../../src/data', mode, 'generated');
  await mkdir(outDir, { recursive: true });

  const client = new EsmClient(esmPath);
  // Partial runs (fewer passes than KNOWN_EXTRACTORS, including anything
  // auto-pulled in by `needs`) start from the existing meta so the sections
  // not re-run keep their counts/excluded review data (they'd be clobbered
  // otherwise). `unresolved` stays run-scoped: it can't be attributed to a
  // section after the fact — a full run refreshes it completely.
  let previousMeta: Partial<GeneratedMeta> = {};
  if (runOrder.length < KNOWN_EXTRACTORS.length) {
    try {
      previousMeta = JSON.parse(
        await readFile(path.join(outDir, '_meta.json'), 'utf8'),
      ) as GeneratedMeta;
    } catch {
      // No previous meta — fresh start.
    }
  }
  const meta: GeneratedMeta = {
    esmPath,
    // Convention: the ESM lives in a date-stamped directory (…/Data/20260702/SeventySix.esm)
    esmDate: /(\d{8})/.exec(esmPath)?.[1] ?? null,
    mode,
    extractedAt: new Date().toISOString(),
    counts: previousMeta.counts ?? {},
    excluded: previousMeta.excluded ?? {},
    excludedDetailed: previousMeta.excludedDetailed ?? {},
    reviewFlagged: previousMeta.reviewFlagged ?? {},
    unresolved: [],
  };

  const memoryResults = new Map<ExtractorName, unknown>();
  for (const pass of runOrder) {
    const ctx = createPassContext(client, mode as GameMode, outDir, memoryResults);
    const { raw, result } = await pass.run(ctx);
    memoryResults.set(pass.id, raw);
    for (const output of result.outputs) await writeOutput(outDir, output);
    foldIntoMeta(meta, result);
  }

  const classification = classifyUnresolved(meta.unresolved);
  const summary = summarizeUnresolvedClassification(meta.unresolved, classification);
  meta.unresolvedClassified = summary;

  await writeFile(path.join(outDir, '_meta.json'), JSON.stringify(meta, null, 2));

  if (summary.total > 0) {
    const ruleCount = classification.classified.size;
    console.warn(
      `Unresolved items (${summary.total}): ${summary.classified} classified (${ruleCount} rule${ruleCount === 1 ? '' : 's'}) · ${summary.unclassified} unclassified — review _meta.json`,
    );
    const dispositionParts = Object.entries(summary.byDisposition)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([disposition, count]) => `${disposition} ${count}`);
    if (dispositionParts.length > 0) {
      console.warn(`  by disposition: ${dispositionParts.join(', ')}`);
    }
    for (const item of classification.unclassified.slice(0, 20)) {
      console.warn(`  - ${item}`);
    }
  }

  if (values['strict-unresolved'] && summary.unclassified > 0) {
    console.error(
      `Strict unresolved: ${summary.unclassified} unclassified entr${summary.unclassified === 1 ? 'y' : 'ies'} (first 20):`,
    );
    for (const item of classification.unclassified.slice(0, 20)) {
      console.error(`  - ${item}`);
    }
    process.exit(1);
  }

  console.log(`Done → ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
