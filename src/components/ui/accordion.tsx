import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion"
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Accordion({
  ...props
}: AccordionPrimitive.Root.Props) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />
}

function AccordionItem({
  className,
  ...props
}: AccordionPrimitive.Item.Props) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("border-b last:border-b-0", className)}
      {...props}
    />
  )
}

function AccordionTrigger({
  className,
  children,
  ...props
}: AccordionPrimitive.Trigger.Props) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          // min-w-0 so a wide trigger row (long section name + badge + summary) can
          // shrink and let its children truncate, instead of spilling out of the card.
          "group/accordion-trigger focus-visible:border-ring focus-visible:ring-ring/30 relative flex min-w-0 flex-1 items-center justify-between gap-4 rounded-none border border-transparent py-4 text-left text-sm font-semibold transition-all outline-none hover:underline focus-visible:ring-2 aria-disabled:pointer-events-none aria-disabled:opacity-50",
          className
        )}
        {...props}
      >
        {children}
        <ChevronDownIcon className="text-muted-foreground pointer-events-none size-3.5 shrink-0 group-aria-expanded/accordion-trigger:hidden" />
        <ChevronUpIcon className="text-muted-foreground pointer-events-none hidden size-3.5 shrink-0 group-aria-expanded/accordion-trigger:inline" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

function AccordionContent({
  className,
  children,
  ...props
}: AccordionPrimitive.Panel.Props) {
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-content"
      // Base UI has no data-closed on Panel (it unmounts when closed by default);
      // the open<->closed height animation is a CSS transition keyed off the
      // starting/ending-style presence attributes instead of Radix's keyframes.
      className="h-(--accordion-panel-height) overflow-hidden text-sm transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0"
      {...props}
    >
      <div className={cn("pb-4 pt-0", className)}>{children}</div>
    </AccordionPrimitive.Panel>
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
