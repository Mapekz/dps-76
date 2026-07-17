import * as React from 'react';
import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';
import { CheckIcon, ChevronDownIcon, ChevronsUpDownIcon, SearchIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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
    () => options.find(option => option.value === value) ?? null,
    [options, value]
  );

  // Base UI's own items/filter/Collection auto-filtering doesn't narrow
  // results in this inline (Popover-hosted) configuration - filter and
  // group ourselves instead, same substring match as the FilterList
  // primitive. Also matches the subtitle (e.g. a unique's base weapon name),
  // which the default label-only filter wouldn't catch.
  const groups = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? options.filter(o => o.label.toLowerCase().includes(q) || (o.subtitle?.toLowerCase().includes(q) ?? false))
      : options;
    const map = new Map<string | undefined, WeaponComboboxOption[]>();
    for (const option of filtered) {
      const bucket = map.get(option.group);
      if (bucket) bucket.push(option);
      else map.set(option.group, [option]);
    }
    return [...map.entries()];
  }, [options, search]);

  const searchActive = search.trim().length > 0;
  const uniqueGroupExpanded = !collapsed || searchActive;
  const hasAny = groups.some(([, groupOptions]) => groupOptions.length > 0);

  return (
    <Popover
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (!next) setSearch('');
      }}
    >
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
        <ComboboxPrimitive.Root
          value={selectedOption}
          isItemEqualToValue={(a: WeaponComboboxOption, b: WeaponComboboxOption) => a.value === b.value}
          inputValue={search}
          onInputValueChange={next => setSearch(next)}
          onValueChange={(next: WeaponComboboxOption | null) => {
            onValueChange(next && next.value === value ? null : (next?.value ?? null));
            setOpen(false);
            setSearch('');
          }}
          inline
          open
        >
          <div data-slot="combobox-input-wrapper" className="flex h-9 items-center gap-2 border-b px-3">
            <SearchIcon className="size-4 shrink-0 opacity-50" />
            <ComboboxPrimitive.Input
              placeholder={searchPlaceholder}
              className="placeholder:text-muted-foreground flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <ComboboxPrimitive.List className="max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto">
            {!hasAny && <div className="py-6 text-center text-sm">{emptyText}</div>}
            {groups.map(([group, groupOptions]) => {
              const isCollapsible = collapsibleGroup !== undefined && group === collapsibleGroup;
              const groupExpanded = !isCollapsible || uniqueGroupExpanded;
              return (
                <ComboboxPrimitive.Group key={group ?? ''} className="text-foreground overflow-hidden p-1">
                  {isCollapsible ? (
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
                  ) : (
                    group && (
                      <ComboboxPrimitive.GroupLabel className="text-muted-foreground px-2 py-1.5 text-xs font-medium">
                        {group}
                      </ComboboxPrimitive.GroupLabel>
                    )
                  )}
                  {groupExpanded &&
                    groupOptions.map(option => (
                      <ComboboxPrimitive.Item
                        key={option.value}
                        value={option}
                        className="data-highlighted:bg-accent data-highlighted:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none"
                      >
                        <CheckIcon className={cn('mr-2 size-4 shrink-0', value === option.value ? 'opacity-100' : 'opacity-0')} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{option.label}</span>
                          {option.subtitle && (
                            <span className="text-muted-foreground block truncate text-xs">{option.subtitle}</span>
                          )}
                        </span>
                      </ComboboxPrimitive.Item>
                    ))}
                </ComboboxPrimitive.Group>
              );
            })}
          </ComboboxPrimitive.List>
        </ComboboxPrimitive.Root>
      </PopoverContent>
    </Popover>
  );
}

export { WeaponCombobox };
