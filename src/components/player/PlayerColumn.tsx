import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { UserIcon } from 'lucide-react';
import type { PlayerConfig, ParsedPerk } from '@/types';

interface PlayerColumnProps {
  config: PlayerConfig;
  parsedPerks: ParsedPerk[];
  onConfigChange: (config: PlayerConfig) => void;
}

export function PlayerColumn({ config, parsedPerks, onConfigChange: _ }: PlayerColumnProps) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2"><UserIcon className="size-5" />Player</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="bg-muted mb-4 flex h-32 items-center justify-center rounded-lg">
          <div className="text-muted-foreground text-center">
            <UserIcon className="mx-auto size-12 opacity-50" />
            <p className="mt-2 text-sm">Character Art</p>
          </div>
        </div>
        <Accordion type="multiple" defaultValue={['perks']} className="w-full">
          <AccordionItem value="weapon">
            <AccordionTrigger>Weapon</AccordionTrigger>
            <AccordionContent><p className="text-muted-foreground text-sm">Weapon configuration coming in v2</p></AccordionContent>
          </AccordionItem>
          <AccordionItem value="armor">
            <AccordionTrigger>Armor</AccordionTrigger>
            <AccordionContent><p className="text-muted-foreground text-sm">Armor configuration coming in v2</p></AccordionContent>
          </AccordionItem>
          <AccordionItem value="perks">
            <AccordionTrigger>Perks ({config.perks.length})</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2">
                {parsedPerks.length > 0 ? (
                  <div className="grid gap-1">
                    {parsedPerks.map((perk, index) => (
                      <div key={`${perk.key}-${index}`} className="bg-muted/50 flex items-center justify-between rounded px-2 py-1 text-sm">
                        <span>{perk.name}</span>
                        <span className="text-muted-foreground">Rank {perk.rank}</span>
                      </div>
                    ))}
                  </div>
                ) : (<p className="text-muted-foreground text-sm">Import a build from Nukes & Dragons to see perks</p>)}
              </div>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="legendary-perks">
            <AccordionTrigger>Legendary Perks ({config.legendaryPerks.length})</AccordionTrigger>
            <AccordionContent><p className="text-muted-foreground text-sm">Legendary perk configuration coming soon</p></AccordionContent>
          </AccordionItem>
          <AccordionItem value="mutations">
            <AccordionTrigger>Mutations ({config.mutations.length})</AccordionTrigger>
            <AccordionContent><p className="text-muted-foreground text-sm">Mutation configuration coming in v2</p></AccordionContent>
          </AccordionItem>
          <AccordionItem value="consumables">
            <AccordionTrigger>Consumables ({config.consumables.length})</AccordionTrigger>
            <AccordionContent><p className="text-muted-foreground text-sm">Consumable configuration coming in v2</p></AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
