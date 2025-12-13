import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Combobox } from '@/components/ui/combobox';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { SkullIcon } from 'lucide-react';
import { useGameMode } from '@/hooks/useGameMode';
import { getEnemyOptions, getMutationOptions, getWeaponOptions, getPowerArmorOptions } from '@/data';
import type { EnemyConfig } from '@/types';

interface EnemyColumnProps {
  config: EnemyConfig;
  onConfigChange: (config: EnemyConfig) => void;
}

export function EnemyColumn({ config, onConfigChange }: EnemyColumnProps) {
  const { mode } = useGameMode();
  const enemyOptions = getEnemyOptions(mode);
  const mutationOptions = getMutationOptions(mode);
  const weaponOptions = getWeaponOptions(mode);
  const powerArmorOptions = getPowerArmorOptions(mode);

  const updateConfig = <K extends keyof EnemyConfig>(key: K, value: EnemyConfig[K]) => {
    onConfigChange({ ...config, [key]: value });
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2"><SkullIcon className="size-5" />Enemy</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="bg-muted mb-4 flex h-32 items-center justify-center rounded-lg">
          <div className="text-muted-foreground text-center">
            <SkullIcon className="mx-auto size-12 opacity-50" />
            <p className="mt-2 text-sm">Enemy Art</p>
          </div>
        </div>
        <Accordion type="multiple" defaultValue={['general']} className="w-full">
          <AccordionItem value="general">
            <AccordionTrigger>General</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Enemy Type</Label>
                  <Combobox options={enemyOptions} value={config.enemyId} onValueChange={(value) => updateConfig('enemyId', value ?? 'super_mutant')} placeholder="Select enemy..." searchPlaceholder="Search enemies..." />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Legendary Rank</Label>
                    <span className="text-muted-foreground text-sm">{config.legendaryRank === 0 ? 'Normal' : `${config.legendaryRank} Star`}</span>
                  </div>
                  <Slider value={[config.legendaryRank]} onValueChange={([value]) => updateConfig('legendaryRank', value as 0 | 1 | 2 | 3)} min={0} max={3} step={1} className="w-full" />
                  <div className="text-muted-foreground flex justify-between text-xs"><span>Normal</span><span>★</span><span>★★</span><span>★★★</span></div>
                </div>
                <div className="space-y-2">
                  <Label>Mutation</Label>
                  <Combobox options={mutationOptions} value={config.mutation} onValueChange={(value) => updateConfig('mutation', value)} placeholder="Select mutation..." searchPlaceholder="Search mutations..." />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="gear">
            <AccordionTrigger>Gear</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Weapon</Label>
                  <Combobox options={weaponOptions} value={config.weaponId} onValueChange={(value) => updateConfig('weaponId', value)} placeholder="Select weapon..." searchPlaceholder="Search weapons..." />
                </div>
                <div className="space-y-2">
                  <Label>Power Armor</Label>
                  <Combobox options={powerArmorOptions} value={config.powerArmorId} onValueChange={(value) => updateConfig('powerArmorId', value)} placeholder="Select power armor..." searchPlaceholder="Search power armor..." />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
