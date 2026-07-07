import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { UserIcon } from 'lucide-react';
import { useGameMode } from '@/hooks/useGameMode';
import { getWeapons } from '@/data';
import { getOmodSlots, getLegendaryOmodSlots } from '@/data/omods';
import { getMutations, getConsumables } from '@/data/buffs';
import type { PlayerConfig, ParsedPerk } from '@/types';

interface PlayerColumnProps {
  config: PlayerConfig;
  parsedPerks: ParsedPerk[];
  onConfigChange: (config: PlayerConfig) => void;
  /** Target-state controls live here until the enemy column returns. */
  enemyFullHealth?: boolean;
  onEnemyFullHealthChange?: (value: boolean) => void;
}

export function PlayerColumn({ config, parsedPerks, onConfigChange, enemyFullHealth = false, onEnemyFullHealthChange }: PlayerColumnProps) {
  const { mode } = useGameMode();
  const weapons = getWeapons(mode);
  const weaponOptions = Object.values(weapons);

  function handleWeaponChange(weaponId: string) {
    onConfigChange({
      ...config,
      weapon: weaponId ? { weaponId, mods: {}, legendaryEffects: [] } : null,
    });
  }

  function handleModChange(slot: string, omodId: string) {
    if (!config.weapon) return;
    onConfigChange({
      ...config,
      weapon: {
        ...config.weapon,
        mods: { ...config.weapon.mods, [slot]: omodId || null },
      },
    });
  }

  function handleItemLevelChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = Math.max(1, Math.min(50, parseInt(e.target.value, 10) || 50));
    onConfigChange({ ...config, itemLevel: val });
  }

  function handleWeakpointMultChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = Math.max(1.0, parseFloat(e.target.value) || 2.0);
    onConfigChange({ ...config, weakpointMult: val });
  }

  function handleConditionChange<K extends keyof PlayerConfig['conditions']>(key: K, value: PlayerConfig['conditions'][K]) {
    onConfigChange({ ...config, conditions: { ...config.conditions, [key]: value } });
  }

  function handleLegendaryChange(slotIndex: number, omodId: string) {
    if (!config.weapon) return;
    const effects = [...config.weapon.legendaryEffects];
    effects[slotIndex] = omodId;
    onConfigChange({
      ...config,
      weapon: { ...config.weapon, legendaryEffects: effects.filter(Boolean) },
    });
  }

  function toggleListItem(key: 'mutations' | 'consumables', id: string) {
    const list = config[key];
    onConfigChange({
      ...config,
      [key]: list.includes(id) ? list.filter(x => x !== id) : [...list, id],
    });
  }

  const selectedWeaponId = config.weapon?.weaponId ?? '';
  const selectedWeapon = selectedWeaponId ? weapons[selectedWeaponId] : undefined;
  const omodSlots = selectedWeapon ? getOmodSlots(mode, selectedWeapon) : [];
  const legendarySlots = selectedWeapon ? getLegendaryOmodSlots(mode, selectedWeapon) : [];
  const mutations = getMutations(mode);
  const consumables = getConsumables(mode);
  const regularPerkCount = config.perks.length;
  const leggoPerkCount   = config.legendaryPerks.length;

  const SPECIAL_KEYS = ['strength', 'perception', 'endurance', 'charisma', 'intelligence', 'agility', 'luck'] as const;

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <UserIcon className="size-5" />
          Player
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" defaultValue={['weapon', 'perks']} className="w-full">

          {/* ── Weapon ────────────────────────────────────────────────────── */}
          <AccordionItem value="weapon">
            <AccordionTrigger>Weapon</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                {/* Weapon selector */}
                <div className="space-y-1.5">
                  <Label htmlFor="weapon-select">Weapon</Label>
                  <select
                    id="weapon-select"
                    value={selectedWeaponId}
                    onChange={e => handleWeaponChange(e.target.value)}
                    className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  >
                    <option value="">— Select a weapon —</option>
                    {weaponOptions.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>

                {/* Mod slots (from ESM attach points; cosmetic slots hidden) */}
                {omodSlots.map(slot => (
                  <div key={slot.slot} className="space-y-1.5">
                    <Label htmlFor={`mod-${slot.slot}`}>{slot.label}</Label>
                    <select
                      id={`mod-${slot.slot}`}
                      value={config.weapon?.mods[slot.slot] ?? ''}
                      onChange={e => handleModChange(slot.slot, e.target.value)}
                      className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                    >
                      <option value="">— Stock —</option>
                      {slot.options.map(o => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                  </div>
                ))}

                {/* Legendary effect slots */}
                {legendarySlots.map((slot, i) => (
                  <div key={slot.slot} className="space-y-1.5">
                    <Label htmlFor={`leg-${slot.slot}`}>Legendary ★{i + 1}</Label>
                    <select
                      id={`leg-${slot.slot}`}
                      value={config.weapon?.legendaryEffects[i] ?? ''}
                      onChange={e => handleLegendaryChange(i, e.target.value)}
                      className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                    >
                      <option value="">— None —</option>
                      {slot.options.map(o => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                  </div>
                ))}

                {/* Item level */}
                <div className="space-y-1.5">
                  <Label htmlFor="item-level">Item Level (1–50)</Label>
                  <Input
                    id="item-level"
                    type="number"
                    min={1}
                    max={50}
                    value={config.itemLevel}
                    onChange={handleItemLevelChange}
                    className="w-full"
                  />
                  <p className="text-muted-foreground text-xs">
                    Used for curve-table base damage lookup. Level-capped weapons clamp at their cap.
                  </p>
                </div>

                {/* Weakpoint multiplier */}
                <div className="space-y-1.5">
                  <Label htmlFor="weakpoint-mult">Weakpoint Multiplier</Label>
                  <Input
                    id="weakpoint-mult"
                    type="number"
                    min={1}
                    step={0.1}
                    value={config.weakpointMult}
                    onChange={handleWeakpointMultChange}
                    className="w-full"
                  />
                  <p className="text-muted-foreground text-xs">
                    Applied to weakpoint hit damage. Default 2.0 (standard headshot).
                  </p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ── SPECIAL ───────────────────────────────────────────────────── */}
          <AccordionItem value="special">
            <AccordionTrigger>SPECIAL</AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-4 gap-2">
                {SPECIAL_KEYS.map(key => (
                  <div key={key} className="space-y-1">
                    <Label htmlFor={`special-${key}`} className="text-xs uppercase">{key.slice(0, 3)}</Label>
                    <Input
                      id={`special-${key}`}
                      type="number"
                      min={1}
                      max={20}
                      value={config.conditions[key]}
                      onChange={e => handleConditionChange(key, Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)))}
                    />
                  </div>
                ))}
              </div>
              <p className="text-muted-foreground mt-2 text-xs">
                Prefilled from the N&amp;D URL. STR feeds melee damage; LCK feeds VATS crit cadence.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* ── Crit economy ──────────────────────────────────────────────── */}
          <AccordionItem value="crit">
            <AccordionTrigger>Crit Economy</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-1.5">
                <Label htmlFor="limit-breaking">Limit Breaking armor pieces (0–5)</Label>
                <Input
                  id="limit-breaking"
                  type="number"
                  min={0}
                  max={5}
                  value={config.conditions.limitBreakingPieces}
                  onChange={e => handleConditionChange('limitBreakingPieces', Math.max(0, Math.min(5, parseInt(e.target.value, 10) || 0)))}
                />
                <p className="text-muted-foreground text-xs">
                  Each piece reduces crit meter consumption by 10%. Critical Savvy comes from the imported perks.
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ── Armor ─────────────────────────────────────────────────────── */}
          <AccordionItem value="armor">
            <AccordionTrigger>Armor</AccordionTrigger>
            <AccordionContent>
              <p className="text-muted-foreground text-sm">
                Armor configuration coming soon — see todos/armor-mods.md.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* ── Perks ─────────────────────────────────────────────────────── */}
          <AccordionItem value="perks">
            <AccordionTrigger>Perks ({regularPerkCount})</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2">
                {parsedPerks.filter(p => !p.key.startsWith('0')).length > 0 ? (
                  <div className="grid gap-1">
                    {parsedPerks.filter(p => !p.key.startsWith('0')).map((perk, index) => (
                      <div
                        key={`${perk.key}-${index}`}
                        className="bg-muted/50 flex items-center justify-between rounded px-2 py-1 text-sm"
                      >
                        <span>{perk.name}</span>
                        <span className="text-muted-foreground">Rank {perk.rank}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Import a build from Nukes &amp; Dragons to see perks.
                  </p>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ── Legendary Perks ───────────────────────────────────────────── */}
          <AccordionItem value="legendary-perks">
            <AccordionTrigger>Legendary Perks ({leggoPerkCount})</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2">
                {parsedPerks.filter(p => p.key.startsWith('0')).length > 0 ? (
                  <div className="grid gap-1">
                    {parsedPerks.filter(p => p.key.startsWith('0')).map((perk, index) => (
                      <div
                        key={`${perk.key}-${index}`}
                        className="bg-muted/50 flex items-center justify-between rounded px-2 py-1 text-sm"
                      >
                        <span>{perk.name}</span>
                        <span className="text-muted-foreground">Rank {perk.rank}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Legendary perks appear here when present in the imported build.
                  </p>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ── Mutations ─────────────────────────────────────────────────── */}
          <AccordionItem value="mutations">
            <AccordionTrigger>Mutations ({config.mutations.length})</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-1">
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={config.conditions.strangeInNumbers}
                    onChange={e => handleConditionChange('strangeInNumbers', e.target.checked)}
                  />
                  <span>Strange in Numbers (team, +25% mutation effects)</span>
                </label>
                {mutations.map(m => (
                  <label key={m.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={config.mutations.includes(m.id)}
                      onChange={() => toggleListItem('mutations', m.id)}
                    />
                    <span>{m.name}</span>
                  </label>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ── Consumables ───────────────────────────────────────────────── */}
          <AccordionItem value="consumables">
            <AccordionTrigger>Consumables ({config.consumables.length})</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-1">
                {consumables.map(c => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={config.consumables.includes(c.id)}
                      onChange={() => toggleListItem('consumables', c.id)}
                    />
                    <span>{c.name}</span>
                  </label>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ── Conditions ────────────────────────────────────────────────── */}
          <AccordionItem value="conditions">
            <AccordionTrigger>Conditions</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cond-health">Health % (Bloodied, Adrenal Reaction)</Label>
                  <Input id="cond-health" type="number" min={1} max={100} value={config.conditions.healthPercent}
                    onChange={e => handleConditionChange('healthPercent', Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 100)))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cond-caps">Caps on hand (Aristocrat's, max at 29k)</Label>
                  <Input id="cond-caps" type="number" min={0} value={config.conditions.capsOnHand}
                    onChange={e => handleConditionChange('capsOnHand', Math.max(0, parseInt(e.target.value, 10) || 0))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cond-addictions">Addictions (Junkie's, 0–5)</Label>
                  <Input id="cond-addictions" type="number" min={0} max={5} value={config.conditions.addictionCount}
                    onChange={e => handleConditionChange('addictionCount', Math.max(0, Math.min(5, parseInt(e.target.value, 10) || 0)))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cond-killstreak">Kill streak (Adrenal effects, 0–10)</Label>
                  <Input id="cond-killstreak" type="number" min={0} max={10} value={config.conditions.adredalineStacks}
                    onChange={e => handleConditionChange('adredalineStacks', Math.max(0, Math.min(10, parseInt(e.target.value, 10) || 0)))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cond-furious">Furious consecutive hits (0–9)</Label>
                  <Input id="cond-furious" type="number" min={0} max={9} value={config.conditions.furiousStacks}
                    onChange={e => handleConditionChange('furiousStacks', Math.max(0, Math.min(9, parseInt(e.target.value, 10) || 0)))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cond-tenderizer">Tenderizer stacks (0–1000, team-dependent)</Label>
                  <Input id="cond-tenderizer" type="number" min={0} max={1000} value={config.conditions.tenderizerStacks}
                    onChange={e => handleConditionChange('tenderizerStacks', Math.max(0, Math.min(1000, parseInt(e.target.value, 10) || 0)))} />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={config.conditions.isPowerAttacking}
                    onChange={e => handleConditionChange('isPowerAttacking', e.target.checked)} />
                  <span>Power attacking (melee)</span>
                </label>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ── Enemy state ───────────────────────────────────────────────── */}
          <AccordionItem value="enemy-state">
            <AccordionTrigger>Target State</AccordionTrigger>
            <AccordionContent>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={enemyFullHealth}
                  onChange={e => onEnemyFullHealthChange?.(e.target.checked)} />
                <span>Target at full health (Instigating)</span>
              </label>
            </AccordionContent>
          </AccordionItem>

        </Accordion>
      </CardContent>
    </Card>
  );
}
