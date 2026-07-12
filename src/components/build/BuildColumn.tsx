import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion } from '@/components/ui/accordion';
import { UserIcon } from 'lucide-react';
import { WeaponSection } from './WeaponSection';
import { PerkEditorSection } from './PerkEditorSection';
import { SpecialSection } from './SpecialSection';
import { StatSummary } from './StatSummary';
import { MutationsSection, ConsumablesSection } from './BuffsSections';
import { ConditionsSection } from './ConditionsSection';

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
        <Accordion type="multiple" defaultValue={['weapon', 'perks']} className="w-full">
          <WeaponSection />
          <SpecialSection />
          <PerkEditorSection />
          <MutationsSection />
          <ConsumablesSection />
          <ConditionsSection />
        </Accordion>
      </CardContent>
    </Card>
  );
}
