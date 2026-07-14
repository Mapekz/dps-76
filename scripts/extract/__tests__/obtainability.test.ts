import { describe, it, expect } from 'vitest';
import type { EsmClient, EsmRefRow } from '../esm-client';
import { ObtainabilityClassifier } from '../obtainability';
import minigunVertibird from './fixtures/refs-minigun-vertibird.json';
import rd01CrAssaultRifle from './fixtures/refs-rd01-crassaultrifle.json';
import lvliNpc from './fixtures/refs-lvli-npc.json';
import weapon44 from './fixtures/refs-44.json';
import protestSign01 from './fixtures/refs-protestsign01.json';
import lvliLoot from './fixtures/refs-lvli-loot.json';
import nukaColaCandy from './fixtures/refs-nukacolacandy.json';
import lvliResoNukaColaCandy from './fixtures/refs-lvli-reso-nukacolacandy.json';
import sunsetSarsaparilla from './fixtures/refs-sunsetsarsaparilla.json';
import lvliSarsaparillaCommon from './fixtures/refs-lvli-sarsaparilla-common.json';
import lvliSarsaparillaDrinks from './fixtures/refs-lvli-sarsaparilla-drinks.json';
import actiSarsaparillaMachine from './fixtures/refs-acti-sarsaparillamachine.json';
import gulpershineVintage from './fixtures/refs-gulpershine-vintage.json';
import gulpershineFresh from './fixtures/refs-gulpershine-fresh.json';
import gulpershineFerm from './fixtures/refs-gulpershine-ferm.json';
import firecrackerFresh from './fixtures/refs-firecracker-fresh.json';
import firecrackerFerm from './fixtures/refs-firecracker-ferm.json';

// Fixtures are verbatim `esm -p --esm <esmPath> refs --formid/--edid <target> --json
// --limit 4000 --depth 1` output (20260702 ESM; the consumable-chain ones below
// from 20260710). Formids:
//   refs-minigun-vertibird.json   Minigun_Vertibird                  0x001299A6
//   refs-rd01-crassaultrifle.json RD01_crAssaultRifle                0x007BC5C4
//   refs-lvli-npc.json            LLI_RD01_MoleMiner_Ranged_Weapons  0x007BC5BA
//                                 (RD01_crAssaultRifle's only referencer)
//   refs-44.json                  "44" (.44 revolver)                0x000CE97D
//   refs-protestsign01.json       ProtestSign01                      0x002D481E
//   refs-lvli-loot.json            LL_Weapon_Simple_Ranged_44         0x001ACFB9
//                                 (one of .44's LVLI referencers; its own refs
//                                 reach a GMRW — QuestReward_RE_SceneTS04_Stage500_01
//                                 — directly at depth 1)
//
// Consumable-chain fixtures (2026-07-14 audit), each the full chain end to end:
//   RESO camp generator — Nuka-Cola Candy Machine
//   refs-nukacolacandy.json            NukaColaCandyMachine_Candy               0x0067B396
//   refs-lvli-reso-nukacolacandy.json  ATX_Resources_NukaColaCandyMachine_Candy 0x0067B39C
//   Craftable dispensing ACTI — Sunset Sarsaparilla machine
//   refs-sunsetsarsaparilla.json       SCORE_S22_Consumable_SunsetSarsaparilla  0x00832CA7
//   refs-lvli-sarsaparilla-common.json SCORE_S22_LL_SarsaparillaMachine_Common  0x00837E0F
//   refs-lvli-sarsaparilla-drinks.json SCORE_S22_LL_SarsaparillaMachine_drinks  0x00832CB2
//   refs-acti-sarsaparillamachine.json SCORE_S22_SarsaparillaMachine            0x00832CA6
//   ALCH ferment/age chain — Mire Magic Moonshine (craftable) vs Firecracker
//   Whiskey (whose recipes have no Created Object, so the chain dead-ends)
//   refs-gulpershine-vintage.json      E08A_Brew_GulpershineVintage             0x00655D13
//   refs-gulpershine-fresh.json        E08A_Brew_GulpershineFresh               0x00622F8B
//   refs-gulpershine-ferm.json         E08A_Brew_GulpershineFerm                0x00655D12
//   refs-firecracker-fresh.json        Brew_FirecrackerWhiskeyFresh             0x00469853
//   refs-firecracker-ferm.json         Brew_FirecrackerWhiskeyFerm              0x00469852

/** Stub EsmClient: formid -> canned refs rows, or 'throw' to simulate a refs() failure. */
function stubClient(rows: Record<string, unknown>): EsmClient {
  return {
    async refs(formId: string): Promise<EsmRefRow[]> {
      const entry = rows[formId];
      if (entry === 'throw') throw new Error('refs failed');
      return (entry as EsmRefRow[] | undefined) ?? [];
    },
  } as unknown as EsmClient;
}

describe('ObtainabilityClassifier', () => {
  it('Minigun_Vertibird: QA chest + DO_NOT_PLACE NPC referencers are junk-filtered → unobtainable', async () => {
    const client = stubClient({ '0x001299A6': minigunVertibird });
    const classifier = new ObtainabilityClassifier(client);
    const verdicts = await classifier.classify([{ formId: '0x001299A6', edid: 'Minigun_Vertibird' }]);
    expect(verdicts.get('0x001299A6')).toEqual({ obtainable: false, signals: [] });
  });

  it('RD01_crAssaultRifle: only referencer is an NPC-loadout LVLI → unobtainable, npcLvliOnly', async () => {
    const client = stubClient({
      '0x007BC5C4': rd01CrAssaultRifle,
      '0x007BC5BA': lvliNpc,
    });
    const classifier = new ObtainabilityClassifier(client);
    const verdicts = await classifier.classify([{ formId: '0x007BC5C4', edid: 'RD01_crAssaultRifle' }]);
    const verdict = verdicts.get('0x007BC5C4')!;
    expect(verdict.obtainable).toBe(false);
    expect(verdict.signals).toContain('npcLvliOnly');
  });

  it('.44: many crafting recipes (COBJ) among the referencers → obtainable', async () => {
    const client = stubClient({ '0x000CE97D': weapon44 });
    const classifier = new ObtainabilityClassifier(client);
    const verdicts = await classifier.classify([{ formId: '0x000CE97D', edid: '44' }]);
    const verdict = verdicts.get('0x000CE97D')!;
    expect(verdict.obtainable).toBe(true);
    expect(verdict.signals.some(s => s.startsWith('cobj:'))).toBe(true);
  });

  it('ProtestSign01: scrap recipe (COBJ _NOCRAFT) no longer proves access, but an independent FLST ref does → obtainable', async () => {
    const client = stubClient({ '0x002D481E': protestSign01 });
    const classifier = new ObtainabilityClassifier(client);
    const verdicts = await classifier.classify([{ formId: '0x002D481E', edid: 'ProtestSign01' }]);
    const verdict = verdicts.get('0x002D481E')!;
    expect(verdict.obtainable).toBe(true);
    expect(verdict.signals.some(s => s.startsWith('flst:'))).toBe(true);
  });

  it('synthetic: only referencer is a _REPAIRONLY/_NOCRAFT COBJ → unobtainable, noGrantCobj', async () => {
    const client = stubClient({
      '0xWEAPON_DEAD_UNIQUE': [
        { form_id: '0xCOBJ1', record_type: 'COBJ', editor_id: 'co_SuperSledge_TheFarmhand_REPAIRONLY', name: null, depth: 1 },
        { form_id: '0xCOBJ2', record_type: 'COBJ', editor_id: 'co_Weapon_Melee_SomeUnique_NOCRAFT', name: null, depth: 1 },
      ],
    });
    const classifier = new ObtainabilityClassifier(client);
    const verdicts = await classifier.classify([{ formId: '0xWEAPON_DEAD_UNIQUE', edid: 'DeadLegacyUnique' }]);
    const verdict = verdicts.get('0xWEAPON_DEAD_UNIQUE')!;
    expect(verdict.obtainable).toBe(false);
    expect(verdict.signals).toContain('noGrantCobj:co_SuperSledge_TheFarmhand_REPAIRONLY');
    expect(verdict.signals).toContain('noGrantCobj:co_Weapon_Melee_SomeUnique_NOCRAFT');
  });

  it('LVLI chain: a weapon whose only referencer is a loot LVLI reaching a GMRW → obtainable, lvli:', async () => {
    // The top-level referencer row (a single LVLI pointing at
    // LL_Weapon_Simple_Ranged_44) is SYNTHETIC — no real weapon in the current
    // dataset has that LVLI as its ONLY referencer (the .44 itself already has
    // direct COBJ referencers, so its own chain never needs this fallback).
    // The recursive step, though, uses the REAL captured refs of that LVLI
    // (refs-lvli-loot.json), which reach a GMRW quest reward directly at
    // depth 1 — so the chain-classification recursion itself is exercised
    // against real ESM data, only the entry point is fabricated.
    const client = stubClient({
      '0xSYNTH_LVLI_ONLY_WEAPON': [
        { form_id: '0x001ACFB9', record_type: 'LVLI', editor_id: 'LL_Weapon_Simple_Ranged_44', name: null, depth: 1 },
      ],
      '0x001ACFB9': lvliLoot,
    });
    const classifier = new ObtainabilityClassifier(client);
    const verdicts = await classifier.classify([{ formId: '0xSYNTH_LVLI_ONLY_WEAPON', edid: 'SynthWeapon' }]);
    const verdict = verdicts.get('0xSYNTH_LVLI_ONLY_WEAPON')!;
    expect(verdict.obtainable).toBe(true);
    expect(verdict.signals).toContain('lvli:LL_Weapon_Simple_Ranged_44');
  });

  it('synthetic: LVLI A ↔ LVLI B cycle with no terminal → unobtainable, does not hang', async () => {
    const client = stubClient({
      '0xWEAPON_CYCLE': [{ form_id: '0xLVLI_A', record_type: 'LVLI', editor_id: 'LVLI_A', name: null, depth: 1 }],
      '0xLVLI_A': [{ form_id: '0xLVLI_B', record_type: 'LVLI', editor_id: 'LVLI_B', name: null, depth: 1 }],
      '0xLVLI_B': [{ form_id: '0xLVLI_A', record_type: 'LVLI', editor_id: 'LVLI_A', name: null, depth: 1 }],
    });
    const classifier = new ObtainabilityClassifier(client);
    const verdicts = await classifier.classify([{ formId: '0xWEAPON_CYCLE', edid: 'CycleWeapon' }]);
    expect(verdicts.get('0xWEAPON_CYCLE')!.obtainable).toBe(false);
  });

  it('synthetic: a placed-ref (REFR) referencer alone is never sufficient → unobtainable, placedRef', async () => {
    const client = stubClient({
      '0xWEAPON_REFR': [{ form_id: '0xREF1', record_type: 'REFR', editor_id: null, name: null, depth: 1 }],
    });
    const classifier = new ObtainabilityClassifier(client);
    const verdicts = await classifier.classify([{ formId: '0xWEAPON_REFR', edid: 'RefrWeapon' }]);
    const verdict = verdicts.get('0xWEAPON_REFR')!;
    expect(verdict.obtainable).toBe(false);
    expect(verdict.signals).toContain('placedRef');
  });

  it('synthetic: an NPC_-only referencer is never sufficient → unobtainable, npcOnly', async () => {
    const client = stubClient({
      '0xWEAPON_NPC': [{ form_id: '0xNPC1', record_type: 'NPC_', editor_id: 'SomeCreature', name: null, depth: 1 }],
    });
    const classifier = new ObtainabilityClassifier(client);
    const verdicts = await classifier.classify([{ formId: '0xWEAPON_NPC', edid: 'NpcWeapon' }]);
    const verdict = verdicts.get('0xWEAPON_NPC')!;
    expect(verdict.obtainable).toBe(false);
    expect(verdict.signals).toContain('npcOnly');
  });

  it('synthetic: a WEAP referencer rides along only when that weapon is already obtainable', async () => {
    const client = stubClient({
      '0xOMOD_OK': [{ form_id: '0xWEAPON_OK', record_type: 'WEAP', editor_id: 'SomeWeaponEdid', name: null, depth: 1 }],
      '0xOMOD_BAD': [{ form_id: '0xWEAPON_BAD', record_type: 'WEAP', editor_id: 'OtherWeaponEdid', name: null, depth: 1 }],
    });
    const classifier = new ObtainabilityClassifier(client, new Set(['0xWEAPON_OK']));
    const verdicts = await classifier.classify([
      { formId: '0xOMOD_OK', edid: 'OmodOk' },
      { formId: '0xOMOD_BAD', edid: 'OmodBad' },
    ]);
    const ok = verdicts.get('0xOMOD_OK')!;
    expect(ok.obtainable).toBe(true);
    expect(ok.signals).toContain('weap:SomeWeaponEdid');
    expect(verdicts.get('0xOMOD_BAD')!.obtainable).toBe(false);
  });

  it('RESO chain: a CAMP resource generator produce list makes its LVLI player-facing → obtainable', async () => {
    // Nuka-Cola Candy: ALCH <- LVLI ATX_Resources_* <- RESO ATX_Resource_*.
    // The RESO is a buildable machine's produce list (COBJ
    // SCORE_S11_workshop_co_Utility_NukaColaCandyMachine builds it), and it is
    // the LVLI's ONLY referencer — so without the RESO terminal this reads as
    // an NPC loadout list and the candy falls out entirely.
    const client = stubClient({
      '0x0067B396': nukaColaCandy,
      '0x0067B39C': lvliResoNukaColaCandy,
    });
    const classifier = new ObtainabilityClassifier(client);
    const verdicts = await classifier.classify([{ formId: '0x0067B396', edid: 'NukaColaCandyMachine_Candy' }]);
    const verdict = verdicts.get('0x0067B396')!;
    expect(verdict.obtainable).toBe(true);
    expect(verdict.signals).toContain('lvli:ATX_Resources_NukaColaCandyMachine_Candy');
  });

  it('craftable ACTI: a buildable vending machine dispensing from an LVLI → obtainable', async () => {
    // Sunset Sarsaparilla: ALCH <- LVLI _Common <- LVLI _drinks <- ACTI
    // SCORE_S22_SarsaparillaMachine, which COBJ
    // SCORE_S22_workshop_co_Resources_SarsaparillaMachine builds.
    const client = stubClient({
      '0x00832CA7': sunsetSarsaparilla,
      '0x00837E0F': lvliSarsaparillaCommon,
      '0x00832CB2': lvliSarsaparillaDrinks,
      '0x00832CA6': actiSarsaparillaMachine,
    });
    const classifier = new ObtainabilityClassifier(client);
    const verdicts = await classifier.classify([
      { formId: '0x00832CA7', edid: 'SCORE_S22_Consumable_SunsetSarsaparilla' },
    ]);
    const verdict = verdicts.get('0x00832CA7')!;
    expect(verdict.obtainable).toBe(true);
    expect(verdict.signals).toContain('lvli:SCORE_S22_LL_SarsaparillaMachine_Common');
  });

  it('craftable ACTI: an activator with NO build recipe cannot launder access → unobtainable', async () => {
    // Same shape as the Sarsaparilla machine, but the activator has no COBJ —
    // a world activator that merely holds a loot list proves nothing.
    const client = stubClient({
      '0xALCH_VIA_WORLD_ACTI': [
        { form_id: '0xLVLI_X', record_type: 'LVLI', editor_id: 'LL_SomeDispenser', name: null, depth: 1 },
      ],
      '0xLVLI_X': [{ form_id: '0xACTI_X', record_type: 'ACTI', editor_id: 'SomeWorldActivator', name: null, depth: 1 }],
      '0xACTI_X': [{ form_id: '0xREFR_X', record_type: 'REFR', editor_id: null, name: null, depth: 1 }],
    });
    const classifier = new ObtainabilityClassifier(client);
    const verdicts = await classifier.classify([{ formId: '0xALCH_VIA_WORLD_ACTI', edid: 'WorldActiConsumable' }]);
    expect(verdicts.get('0xALCH_VIA_WORLD_ACTI')!.obtainable).toBe(false);
  });

  it('ALCH chain: an aged brew rides along on the craftable state it ferments from → obtainable', async () => {
    // Vintage Mire Magic Moonshine's only referencer is the Fresh state it ages
    // from; Fresh's chain reaches COBJ E08A_co_Gulpershine via Ferm.
    const client = stubClient({
      '0x00655D13': gulpershineVintage,
      '0x00622F8B': gulpershineFresh,
      '0x00655D12': gulpershineFerm,
    });
    const classifier = new ObtainabilityClassifier(client);
    const verdicts = await classifier.classify([{ formId: '0x00655D13', edid: 'E08A_Brew_GulpershineVintage' }]);
    const verdict = verdicts.get('0x00655D13')!;
    expect(verdict.obtainable).toBe(true);
    expect(verdict.signals).toContain('alch:E08A_Brew_GulpershineFresh');
  });

  it('ALCH chain: Firecracker Whiskey dead-ends at a no-output recipe → still unobtainable', async () => {
    // Regression guard for the ALCH ride-along. Fresh <- ALCH Ferm, but NOTHING
    // creates Ferm: co_Brewing_FirecrackerWhiskey carries no Created Object
    // field at all, so its only referencers are POST_/CUT_ challenge records.
    // Challenges are authored against cut content, so CHAL must never count.
    const client = stubClient({
      '0x00469853': firecrackerFresh,
      '0x00469852': firecrackerFerm,
    });
    const classifier = new ObtainabilityClassifier(client);
    const verdicts = await classifier.classify([{ formId: '0x00469853', edid: 'Brew_FirecrackerWhiskeyFresh' }]);
    expect(verdicts.get('0x00469853')!.obtainable).toBe(false);
  });

  it('refs() throwing → refsError; empty refs → noRefs', async () => {
    const client = stubClient({ '0xTHROWS': 'throw' });
    const classifier = new ObtainabilityClassifier(client);
    const verdicts = await classifier.classify([
      { formId: '0xTHROWS', edid: 'ThrowsWeapon' },
      { formId: '0xNOTHING', edid: 'NoRefsWeapon' },
    ]);
    expect(verdicts.get('0xTHROWS')).toEqual({ obtainable: false, signals: ['refsError'] });
    expect(verdicts.get('0xNOTHING')).toEqual({ obtainable: false, signals: ['noRefs'] });
  });
});
