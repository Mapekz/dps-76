import * as React from 'react';
import { CheckIcon, ChevronDownIcon, ChevronsUpDownIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface WeaponComboboxOption {
  value: string;
  label: string;
  group?: string;
  /** Muted secondary line (e.g. base weapon name for uniques). */
  subtitle?: string;
}

interface WeaponComboboxProps {
  options: WeaponComboboxOption[];
  value: string | null;
  onValueChange: (value: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  /** Group heading that renders as a collapsible section (collapsed by default). */
  collapsibleGroup?: string;
}

function WeaponCombobox({
  options,
  value,
  onValueChange,
  placeholder = 'Select option...',
  searchPlaceholder = 'Search...',
  emptyText = 'No option found.',
  className,
  disabled = false,
  collapsibleGroup,
}: WeaponComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [collapsed, setCollapsed] = React.useState(true);

  const selectedOption = React.useMemo(
    () => options.find(option => option.value === value),
    [options, value]
  );

  const groups = React.useMemo(() => {
    const map = new Map<string | undefined, WeaponComboboxOption[]>();
    for (const option of options) {
      const bucket = map.get(option.group);
      if (bucket) bucket.push(option);
      else map.set(option.group, [option]);
    }
    return [...map.entries()];
  }, [options]);

  const searchActive = search.trim().length > 0;
  const uniqueGroupExpanded = !collapsed || searchActive;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn('w-full justify-between', className)}
          />
        }
      >
        <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[--anchor-width] p-0">
        <Command shouldFilter>
          <CommandInput
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {groups.map(([group, groupOptions]) => {
              const isCollapsible = collapsibleGroup !== undefined && group === collapsibleGroup;
              return (
                <CommandGroup key={group ?? ''} heading={isCollapsible ? undefined : group}>
                  {isCollapsible && (
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground flex w-full items-center justify-between px-2 py-1.5 text-xs font-medium"
                      onClick={() => setCollapsed(c => !c)}
                    >
                      <span>
                        {group} ({groupOptions.length})
                      </span>
                      <ChevronDownIcon
                        className={cn('size-4 transition-transform', uniqueGroupExpanded && 'rotate-180')}
                      />
                    </button>
                  )}
                  {(!isCollapsible || uniqueGroupExpanded) &&
                    groupOptions.map(option => (
                      <CommandItem
                        key={option.value}
                        value={option.value}
                        keywords={[option.label, option.subtitle ?? ''].filter(Boolean)}
                        onSelect={currentValue => {
                          onValueChange(currentValue === value ? null : currentValue);
                          setOpen(false);
                          setSearch('');
                        }}
                      >
                        <CheckIcon
                          className={cn('mr-2 size-4', value === option.value ? 'opacity-100' : 'opacity-0')}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{option.label}</span>
                          {option.subtitle && (
                            <span className="text-muted-foreground block truncate text-xs">{option.subtitle}</span>
                          )}
                        </span>
                      </CommandItem>
                    ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export { WeaponCombobox };
