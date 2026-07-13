import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion } from '@/components/ui/accordion';
import { UserIcon } from 'lucide-react';
import { WeaponSection } from './WeaponSection';
import { SpecialLoadoutSection } from './SpecialLoadoutSection';
import { StatSummary } from './StatSummary';
import { MutationsSection, ConsumablesSection } from './BuffsSections';
import { ConditionsSection } from './ConditionsSection';
import { TargetSection } from './TargetSection';

export function BuildColumn() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="font-condensed flex items-center gap-2 text-base font-semibold uppercase tracking-[0.12em]">
          <UserIcon className="size-4" />
          Build
        </CardTitle>
      </CardHeader>
      <CardContent>
        <StatSummary />
        <Accordion type="multiple" defaultValue={['weapon', 'special-loadout']} className="w-full">
          <WeaponSection />
          <SpecialLoadoutSection />
          <MutationsSection />
          <ConditionsSection />
          <ConsumablesSection />
          <TargetSection />
        </Accordion>
      </CardContent>
    </Card>
  );
}
