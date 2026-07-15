import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { SectionTrigger } from './SectionTrigger';

export function ArmorSection() {
  return (
    <AccordionItem value="armor">
      <AccordionTrigger>
        <SectionTrigger label="Armor" summary="coming soon" />
      </AccordionTrigger>
      <AccordionContent>
        <p className="text-muted-foreground text-sm">Armor configuration is coming soon.</p>
      </AccordionContent>
    </AccordionItem>
  );
}
