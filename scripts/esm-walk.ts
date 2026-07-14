import { EsmClient, type EsmRecord } from './extract/esm-client';
import { repairMisattributedPerkEntryFields } from './extract/normalize/mgef';
import { flattenConditionRows, flattenPerkConditionRows, type RawCondition } from './extract/normalize/conditions';

/**
 * ESM record walker — one command, one compact digest, instead of a chain of
 * raw `esm get` dumps. Follows the standard record chains (SPEL/ENCH/ALCH
 * effects → MGEF → "Perk to Apply" → PERK → Ability SPELs), resolves every
 * referenced AV/GLOB/keyword to its editor id, prints curve points, and
 * classifies reverse references for obtainability review.
 *
 *   pnpm esm:walk <formid|edid> [--refs] [--depth N] [--esm <path>]
 *
 * ESM path resolves from --esm, else the FO76_ESM_PATH env var.
 *
 * The digest is for AGENT/human reading — the extraction pipeline never uses
 * this file. Judgment guidance lives in .claude/skills/esm-walk/SKILL.md.
 */

interface Args {
  target: string;
  refs: boolean;
  depth: number;
  esmPath: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let target = '';
  let refs = false;
  let depth = 2;
  let esmPath = '';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--refs') refs = true;
    else if (a === '--depth') depth = parseInt(argv[++i], 10) || 2;
    else if (a === '--esm') esmPath = argv[++i];
    else if (!target) target = a;
  }
  if (!target) {
    console.error('Usage: pnpm esm:walk <formid|edid> [--refs] [--depth N] [--esm <path>]');
    process.exit(1);
  }
  esmPath ||= process.env.FO76_ESM_PATH ?? '';
  if (!esmPath) {
    console.error('No ESM path: pass --esm <path> or set the FO76_ESM_PATH env var.');
    process.exit(1);
  }
  return { target, refs, depth, esmPath };
}

const args = parseArgs();
const client = new EsmClient(args.esmPath);
const visited = new Set<string>();
const queue: Array<{ target: string; depth: number; via: string }> = [];

const isFormId = (s: unknown): s is string => typeof s === 'string' && /^0x[0-9A-Fa-f]{8}$/.test(s);

/** "0x00511AE4 AbPerkFortifyHealth" — the universal reference rendering. */
async function ref(formId: unknown): Promise<string> {
  if (!isFormId(formId)) return String(formId ?? 'null');
  return `${formId} ${await client.resolveEdid(formId)}`;
}

async function globValue(formId: string): Promise<string> {
  try {
    const rec = await client.get(formId);
    return `${rec.editor_id}=${rec.fields['Value']}`;
  } catch {
    return `<unresolved:${formId}>`;
  }
}

function fmtConditions(rows: RawCondition[]): string[] {
  return rows.map(r => {
    const p1 = r['Parameter 1'];
    const runOn = r['Run On'] && r['Run On'] !== 'Subject' ? ` on ${r['Run On']}` : '';
    const andOr = r['AND/OR'] === 'OR' ? ' [OR]' : '';
    return `${r.Function}(${p1 ?? ''}) ${r.Operator ?? '=='} ${r['Comparison Value']}${runOn}${andOr}`;
  });
}

/** Resolve GLOB formids inside condition comparison values / param 1. */
async function fmtConditionsResolved(rows: RawCondition[]): Promise<string[]> {
  const out: string[] = [];
  for (const line of fmtConditions(rows)) {
    const m = line.match(/0x[0-9A-Fa-f]{8}/g) ?? [];
    let annotated = line;
    for (const f of m) {
      const rec = await client.get(f).catch(() => null);
      if (rec) {
        const val = rec.header.signature === 'GLOB' ? `=${rec.fields['Value']}` : '';
        annotated = annotated.replace(f, `${f}<${rec.editor_id}${val}>`);
      }
    }
    out.push(annotated);
  }
  return out;
}

function curveStr(curve: unknown): string | null {
  const c = curve as { curve_path?: string; curve?: Array<{ x: number; y: number }> } | undefined;
  if (!c?.curve?.length) return null;
  const pts = c.curve.map(p => `(${p.x},${p.y})`).join('');
  return `${pts}${c.curve_path ? `  [${c.curve_path}]` : ''}`;
}

function enqueue(target: unknown, depth: number, via: string) {
  if (isFormId(target) && depth < args.depth && !visited.has(target)) queue.push({ target, depth, via });
}

const out: string[] = [];
const emit = (indent: number, line: string) => out.push(`${'  '.repeat(indent)}${line}`);

// ── per-type digests ─────────────────────────────────────────────────────────

async function digestMagicItem(rec: EsmRecord, depth: number): Promise<void> {
  const effects = rec.fields['Effects'];
  if (!Array.isArray(effects)) return;
  for (const [i, item] of (effects as Array<Record<string, unknown>>).entries()) {
    const e = item['Effect'] as Record<string, unknown> | undefined;
    if (!e) continue;
    const data = (e['Effect Item Data'] ?? {}) as Record<string, unknown>;
    const flatMag = (data['Magnitude'] as number) ?? 0;
    const mgef = await client.get(e['Base Effect'] as string).catch(() => null);
    const mgefData = ((mgef?.fields['Magic Effect Data'] as Record<string, unknown>)?.['Data'] ?? {}) as Record<
      string,
      unknown
    >;
    const archetype = ((mgefData['Archetype'] as Record<string, unknown>)?.['name'] as string) ?? '?';
    const targetAv = mgefData['Actor Value'];

    emit(1, `effect[${i}] → MGEF ${await ref(e['Base Effect'])} (${archetype}${isFormId(targetAv) ? `, AV ${await ref(targetAv)}` : ''})`);
    emit(2, `magnitude ${flatMag}  duration ${(data['Duration'] as number) ?? 0}`);
    if (isFormId(e['Magnitude'])) {
      const g = await globValue(e['Magnitude'] as string);
      emit(2, flatMag === 0 ? `magnitude GLOB ${g}  ← real value (flat is 0)` : `sibling Magnitude GLOB ${g}  ← IGNORE (flat wins; survival scale const)`);
    }
    if (isFormId(e['Duration'])) emit(2, `duration GLOB ${await globValue(e['Duration'] as string)}`);
    const curve = curveStr(e['Curve Table']);
    if (curve) {
      emit(2, `curve ${curve}`);
      if (isFormId(e['Actor Value'])) emit(2, `curve INPUT axis: AV ${await ref(e['Actor Value'])}`);
    }
    for (const c of await fmtConditionsResolved(flattenConditionRows(e['Conditions']))) emit(2, `cond: ${c}`);

    const perkToApply = mgefData['Perk to Apply'];
    if (isFormId(perkToApply)) {
      emit(2, `Perk to Apply → ${await ref(perkToApply)}`);
      enqueue(perkToApply, depth + 1, 'Perk to Apply');
    }
  }
}

async function digestMgef(rec: EsmRecord, depth: number): Promise<void> {
  const data = ((rec.fields['Magic Effect Data'] as Record<string, unknown>)?.['Data'] ?? {}) as Record<string, unknown>;
  emit(1, `archetype ${(data['Archetype'] as Record<string, unknown>)?.['name'] ?? '?'}  casting ${(data['Casting Type'] as Record<string, unknown>)?.['name'] ?? '?'}`);
  if (isFormId(data['Actor Value'])) emit(1, `target AV ${await ref(data['Actor Value'])}`);
  if (isFormId(data['Resist Value'])) emit(1, `resist AV ${await ref(data['Resist Value'])} (element carrier for Damage archetype)`);
  if (isFormId(data['Perk to Apply'])) {
    emit(1, `Perk to Apply → ${await ref(data['Perk to Apply'])}`);
    enqueue(data['Perk to Apply'], depth + 1, 'Perk to Apply');
  }
  const desc = rec.fields['Magic Item Description'];
  if (desc) emit(1, `description "${desc}"`);
}

async function digestPerk(rec: EsmRecord, depth: number): Promise<void> {
  const data = (rec.fields['Data'] ?? {}) as Record<string, unknown>;
  if (rec.fields['Description']) emit(1, `description "${rec.fields['Description']}"`);
  emit(1, `ranks ${data['Num Ranks'] ?? '?'}  playable ${(data['Playable'] as Record<string, unknown>)?.['name'] ?? '?'}${isFormId(rec.fields['Next Perk']) ? `  next → ${await ref(rec.fields['Next Perk'])}` : ''}`);

  const effects = rec.fields['Effects'];
  if (!Array.isArray(effects)) {
    emit(1, 'NO effects — bonus is engine/script-side (description only)');
    return;
  }
  // Apply the known esm-CLI serializer quirk fix before reading fields.
  repairMisattributedPerkEntryFields(effects as Array<Record<string, unknown>>);
  for (const [i, item] of (effects as Array<Record<string, unknown>>).entries()) {
    const e = item['Effect'] as Record<string, unknown> | undefined;
    if (!e) continue;
    const typeName = ((e['Effect Header'] as Record<string, unknown>)?.['Effect Type'] as Record<string, unknown>)?.['name'];
    if (typeName === 'Ability') {
      emit(1, `effect[${i}] Ability → SPEL ${await ref(e['Ability'])}`);
      enqueue(e['Ability'], depth + 1, 'Ability');
    } else if (typeName === 'Entry Point') {
      const ep = (e['Entry Point'] ?? {}) as Record<string, unknown>;
      const epName = (ep['Entry Point'] as Record<string, unknown>)?.['name'] ?? '?';
      const fn = (ep['Function'] as Record<string, unknown>)?.['name'] ?? '?';
      const av = e['Function Parameter 3 (Actor Value)'];
      emit(1, `effect[${i}] Entry Point "${epName}"  fn ${fn}${typeof e['Float'] === 'number' ? `  value ${e['Float']}` : ''}${isFormId(av) ? `  AV ${await ref(av)}` : ''}`);
      for (const c of await fmtConditionsResolved(flattenPerkConditionRows(e['Perk Conditions']))) emit(2, `cond: ${c}`);
    } else {
      emit(1, `effect[${i}] ${typeName}`);
    }
  }
}

async function digestWeap(rec: EsmRecord): Promise<void> {
  const f = rec.fields;
  const data = (f['Data'] ?? {}) as Record<string, unknown>;
  const keywordsNode = (f['Keywords'] ?? {}) as Record<string, unknown>;
  const keywordIds = (keywordsNode['Keywords'] as string[]) ?? [];
  await client.bulkGet(keywordIds).catch(() => {});
  const keywords: string[] = [];
  for (const k of keywordIds) {
    const edid = await client.resolveEdid(k);
    if (/^WeaponType|^HasLegendary|^ma_/.test(edid)) keywords.push(edid);
  }
  const levels = Array.isArray(f['Eligible Levels']) ? (f['Eligible Levels'] as number[]) : [];
  emit(1, `keywords: ${keywords.join(', ') || '(none damage-relevant)'}`);
  emit(1, `apCost ${data['Action Point Cost'] ?? '?'}  speed ${data['Speed'] ?? '?'}  reloadSpeed ${data['Reload Speed'] ?? '?'}`);
  emit(1, `eligible levels: ${levels.join(',') || '—'}  attach slots: ${Array.isArray(f['Attach Parent Slots']) ? (f['Attach Parent Slots'] as string[]).length : 0}`);
  const template = f['Object Template'] as Record<string, unknown> | undefined;
  if (template) emit(1, `has Object Template (instance-template mods = POSSIBLE loadouts, never auto-apply)`);
}

/** Model/render/sound noise that never matters for damage or obtainability. */
const GENERIC_NOISE_KEYS = new Set([
  'Object Bounds', 'Model', 'Preview Transform', 'Sound Level', 'Sounds', 'Sound', 'Pickup Sound', 'Putdown Sound',
  'Icon', 'Message Icon', 'Transform', 'Animation Sound',
]);

async function digestGeneric(rec: EsmRecord): Promise<void> {
  // Trimmed field dump with every formid annotated (bounded resolution).
  let resolved = 0;
  const annotate = async (node: unknown): Promise<unknown> => {
    if (isFormId(node)) return resolved++ < 40 ? await ref(node) : node;
    if (Array.isArray(node)) return Promise.all(node.map(annotate));
    if (node && typeof node === 'object') {
      const o: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (v === null || v === '' || k === 'Unknown' || GENERIC_NOISE_KEYS.has(k)) continue;
        if (typeof v === 'object' && v !== null && '_raw' in (v as object)) continue;
        o[k] = await annotate(v);
      }
      return o;
    }
    return node;
  };
  const fields = (await annotate(rec.fields)) as Record<string, unknown>;
  delete fields['_record_type'];
  delete fields['Editor ID'];
  const dump = JSON.stringify(fields, null, 1).split('\n');
  const MAX = 120;
  for (const line of dump.slice(0, MAX)) emit(1, line);
  if (dump.length > MAX) emit(1, `… ${dump.length - MAX} more lines (use \`esm get\` for the full record)`);
}

/**
 * KYWD/AVIF records carry no behavior themselves — they're read by whichever
 * SPEL/PERK gates an effect on them (`WornHasKeyword(...)` / an entry-point
 * function's target AV). Reverse-`refs --type ... --paths` finds those
 * consumers and the exact field path each one gates through, same hop
 * `esm chase` does from the OMOD side (see esm-walk skill).
 */
async function digestKeywordOrAv(formId: string): Promise<void> {
  for (const type of ['SPEL', 'PERK'] as const) {
    const rows = await client.refs(formId, { depth: 1, type, paths: true }).catch(() => []);
    if (rows.length === 0) continue;
    emit(1, `${type} consumers (gate on this):`);
    for (const r of rows.slice(0, 10)) {
      const path = r.field_paths?.[0];
      emit(2, `${r.form_id} ${r.editor_id}${path ? `  via ${path}` : ''}`);
    }
    if (rows.length > 10) emit(2, `… +${rows.length - 10} more`);
  }
}

async function digestRefs(formId: string): Promise<void> {
  const rows = await client.refs(formId, { depth: 1 });
  if (rows.length === 0) {
    emit(1, 'NO reverse references — normal for script/VMAD quest rewards, vendor grants, and account-side (ATX) items; check the rescue lists before assuming junk.');
    return;
  }
  const byType = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byType.get(r.record_type) ?? [];
    list.push(r);
    byType.set(r.record_type, list);
  }
  const OBTAINABLE_TYPES = new Set(['COBJ', 'GMRW', 'LGDI', 'QUST', 'CONT', 'MISC', 'FLST']);
  for (const [type, list] of [...byType.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const sample = list
      .slice(0, 5)
      .map(r => r.editor_id + (/NONPLAYABLE/i.test(r.editor_id) ? ' ⚠NONPLAYABLE' : ''))
      .join(', ');
    const tag = OBTAINABLE_TYPES.has(type) ? '  [player-facing signal]' : type === 'LVLI' ? '  [only player-facing LVLI chains count]' : '';
    emit(1, `${type} ×${list.length}: ${sample}${list.length > 5 ? ', …' : ''}${tag}`);
  }
  emit(1, 'Reminder: the record graph cannot distinguish shipped from UNRELEASED content (P62/The Drifter looked obtainable). Confirm release status before rescuing.');
}

// ── main walk loop ───────────────────────────────────────────────────────────

async function walk(target: string, depth: number, via: string): Promise<void> {
  let rec: EsmRecord;
  try {
    rec = await client.get(target);
  } catch {
    const matches = await client.search(target, { limit: 10 }).catch(() => []);
    emit(0, `"${target}" not found by get.${matches.length ? ' Search matches:' : ' No search matches either.'}`);
    for (const m of matches) emit(1, `${m.form_id} ${m.record_type} ${m.editor_id} ${m.name ?? ''}`);
    return;
  }
  const formId = rec.header.form_id;
  if (visited.has(formId)) return;
  visited.add(formId);

  const sig = rec.header.signature;
  const name = rec.fields['Name'] ? ` "${rec.fields['Name']}"` : '';
  emit(0, '');
  emit(0, `${'▸'.repeat(depth + 1)} ${sig} ${formId} ${rec.editor_id}${name}${via ? `  (via ${via})` : ''}`);

  if (sig === 'GLOB') emit(1, `value ${rec.fields['Value']}`);
  else if (sig === 'AVIF') {
    emit(1, `abbrev ${rec.fields['Abbreviation'] ?? '—'}  default ${rec.fields['Default Value'] ?? '?'}  max ${rec.fields['Maximum Value'] ?? '?'}`);
    await digestKeywordOrAv(formId);
  } else if (sig === 'KYWD') await digestKeywordOrAv(formId);
  else if (sig === 'MGEF') await digestMgef(rec, depth);
  else if (sig === 'SPEL' || sig === 'ENCH' || sig === 'ALCH') await digestMagicItem(rec, depth);
  else if (sig === 'PERK') await digestPerk(rec, depth);
  else if (sig === 'WEAP') await digestWeap(rec);
  else await digestGeneric(rec);

  // OMODs carry their payload in ENCH-typed properties — follow them so the
  // full OMOD → ENCH → MGEF → granted-perk chain lands in one invocation.
  if (sig === 'OMOD') {
    const formIds = [...new Set(JSON.stringify(rec.fields).match(/0x[0-9A-Fa-f]{8}/g) ?? [])];
    const sliceIds = formIds.slice(0, 25);
    await client.bulkGet(sliceIds).catch(() => {});
    for (const f of sliceIds) {
      const sub = await client.get(f).catch(() => null);
      if (sub?.header.signature === 'ENCH') {
        emit(1, `enchantment → ${f} ${sub.editor_id}`);
        enqueue(f, depth + 1, 'OMOD property');
      }
    }
  }

  if (args.refs && depth === 0) {
    emit(0, '');
    emit(0, 'reverse refs:');
    await digestRefs(formId);
  }
}

await walk(args.target, 0, '');
while (queue.length > 0) {
  const next = queue.shift()!;
  await walk(next.target, next.depth, next.via);
}
console.log(out.join('\n'));
