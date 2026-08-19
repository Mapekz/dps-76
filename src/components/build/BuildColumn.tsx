import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion } from '@/components/ui/accordion';
import { UserIcon } from 'lucide-react';
import { PresetPicker } from './PresetPicker';
import { WeaponSection } from './WeaponSection';
import { ArmorSection } from './ArmorSection';
import { SpecialLoadoutSection } from './SpecialLoadoutSection';
import { StatSummary } from './StatSummary';
import { MutationsSection } from './buffs/MutationsSection';
import { ChemsSection } from './buffs/ChemsSection';
import { FoodDrinkSection } from './buffs/FoodDrinkSection';
import { MagazinesSection, BobbleheadsSection } from './buffs/shared';
import { ConditionsSection } from './ConditionsSection';
import { TeamSection } from './TeamSection';

export function BuildColumn() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle level={2} className="flex items-center gap-2">
          <UserIcon className="size-4" />
          Build
        </CardTitle>
      </CardHeader>
      <CardContent>
        <PresetPicker />
        <StatSummary />
        <Accordion multiple defaultValue={['weapon', 'special-loadout']} className="w-full">
          <WeaponSection />
          <ArmorSection />
          <SpecialLoadoutSection />
          <TeamSection />
          <MutationsSection />
          <ConditionsSection />
          <ChemsSection />
          <FoodDrinkSection />
          <MagazinesSection />
          <BobbleheadsSection />
        </Accordion>
      </CardContent>
    </Card>
  );
}
