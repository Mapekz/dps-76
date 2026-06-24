import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { UserIcon } from 'lucide-react';
import { useGameMode } from '@/hooks/useGameMode';
import { getWeapons } from '@/data';
import type { PlayerConfig, ParsedPerk } from '@/types';

interface PlayerColumnProps {
  config: PlayerConfig;
  parsedPerks: ParsedPerk[];
  onConfigChange: (config: PlayerConfig) => void;
}

export function PlayerColumn({ config, parsedPerks, onConfigChange }: PlayerColumnProps) {
  const { mode } = useGameMode();
  const weapons = getWeapons(mode);
  const weaponOptions = Object.values(weapons);

  function handleWeaponChange(weaponId: string) {
    onConfigChange({
      ...config,
      weapon: weaponId
        ? { weaponId, mods: { receiver: null, barrel: null, grip: null, magazine: null, sights: null, muzzle: null }, legendaryEffects: [] }
        : null,
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

  const selectedWeaponId = config.weapon?.weaponId ?? '';
  const regularPerkCount = config.perks.length;
  const leggoPerkCount   = config.legendaryPerks.length;

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
              <p className="text-muted-foreground text-sm">
                Mutation configuration coming in v2.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* ── Consumables ───────────────────────────────────────────────── */}
          <AccordionItem value="consumables">
            <AccordionTrigger>Consumables ({config.consumables.length})</AccordionTrigger>
            <AccordionContent>
              <p className="text-muted-foreground text-sm">
                Consumable configuration coming in v2.
              </p>
            </AccordionContent>
          </AccordionItem>

        </Accordion>
      </CardContent>
    </Card>
  );
}
