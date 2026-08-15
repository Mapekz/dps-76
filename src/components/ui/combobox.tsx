import * as React from 'react';
import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';
import { CheckIcon, ChevronDownIcon, ChevronsUpDownIcon, SearchIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface ComboboxOption {
  value: string;
  label: string;
  /** Group heading this option renders under; ungrouped options share one headingless group. */
  group?: string;
  /** Muted secondary line under the label (e.g. a unique's base weapon name). Also matched by search. */
  subtitle?: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string | null;
  onValueChange: (value: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  /** Extra right-aligned content per option row (e.g. a ΔDPS preview). */
  renderOptionExtra?: (option: ComboboxOption) => React.ReactNode;
  /** Group heading that renders as a collapsible section (collapsed by default). */
  collapsibleGroup?: string;
}

function Combobox({
  options,
  value,
  onValueChange,
  placeholder = 'Select option...',
  searchPlaceholder = 'Search...',
  emptyText = 'No option found.',
  className,
  disabled = false,
  renderOptionExtra,
  collapsibleGroup,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [collapsed, setCollapsed] = React.useState(true);

  const selectedOption = React.useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  // Base UI's own items/filter/Collection auto-filtering doesn't narrow
  // results in this inline (Popover-hosted) configuration - filter and
  // group ourselves instead, same substring match as the FilterList
  // primitive. Also matches subtitle (e.g. a unique's base weapon name),
  // which the label-only filter wouldn't catch; a no-op for callers whose
  // options never set subtitle. One group per group in first-seen order
  // (callers pre-sort).
  const groups = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? options.filter(
          (o) =>
            o.label.toLowerCase().includes(q) || (o.subtitle?.toLowerCase().includes(q) ?? false),
        )
      : options;
    const map = new Map<string | undefined, ComboboxOption[]>();
    for (const option of filtered) {
      const bucket = map.get(option.group);
      if (bucket) bucket.push(option);
      else map.set(option.group, [option]);
    }
    return [...map.entries()];
  }, [options, search]);

  const searchActive = search.trim().length > 0;
  const collapsibleGroupExpanded = !collapsed || searchActive;
  const hasAny = groups.some(([, groupOptions]) => groupOptions.length > 0);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
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
            // The popup's option rows are normal-case; the trigger inherits
            // Button's uppercase/tracking-widest base, so override both here
            // to match — mirrors real stock base-sera, whose combobox
            // trigger never wraps a Button at all.
            className={cn('w-full justify-between normal-case tracking-normal', className)}
          />
        }
      >
        <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[--anchor-width] p-0">
        {/* inline: the Popover above already owns the portal/positioning/open
            state, so Combobox only supplies the filterable list underneath -
            mirrors the previous cmdk-in-Popover composition. */}
        <ComboboxPrimitive.Root
          value={selectedOption}
          isItemEqualToValue={(a: ComboboxOption, b: ComboboxOption) => a.value === b.value}
          inputValue={search}
          onInputValueChange={(next) => setSearch(next)}
          onValueChange={(next: ComboboxOption | null) => {
            // Re-picking the selected option clears it, matching the old cmdk onSelect toggle.
            onValueChange(next && next.value === value ? null : (next?.value ?? null));
            setOpen(false);
            setSearch('');
          }}
          inline
          open
        >
          <div
            data-slot="combobox-input-wrapper"
            className="flex h-10 items-center gap-2 border-b border-input px-3"
          >
            <SearchIcon className="size-3.5 shrink-0 opacity-50" />
            <ComboboxPrimitive.Input
              placeholder={searchPlaceholder}
              className="placeholder:text-muted-foreground flex h-10 w-full bg-transparent py-3 text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <ComboboxPrimitive.List className="max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto">
            {!hasAny && <div className="py-6 text-center text-sm">{emptyText}</div>}
            {groups.map(([group, groupOptions]) => {
              if (groupOptions.length === 0) return null;
              const isCollapsible = collapsibleGroup !== undefined && group === collapsibleGroup;
              const groupExpanded = !isCollapsible || collapsibleGroupExpanded;
              return (
                <ComboboxPrimitive.Group
                  key={group ?? ''}
                  className="text-foreground overflow-hidden p-1"
                >
                  {isCollapsible ? (
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground flex w-full items-center justify-between px-3 py-2 text-xs font-semibold tracking-wider uppercase"
                      onClick={() => setCollapsed((c) => !c)}
                    >
                      <span>
                        {group} ({groupOptions.length})
                      </span>
                      <ChevronDownIcon
                        className={cn(
                          'size-4 transition-transform',
                          collapsibleGroupExpanded && 'rotate-180',
                        )}
                      />
                    </button>
                  ) : (
                    group && (
                      <ComboboxPrimitive.GroupLabel className="px-3 py-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                        {group}
                      </ComboboxPrimitive.GroupLabel>
                    )
                  )}
                  {groupExpanded &&
                    groupOptions.map((option) => (
                      <ComboboxPrimitive.Item
                        key={option.value}
                        value={option}
                        className="data-highlighted:bg-accent data-highlighted:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-none px-2 py-1.5 text-sm outline-hidden select-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
                      >
                        <CheckIcon
                          className={cn(
                            'mr-2 size-4',
                            value === option.value ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{option.label}</span>
                          {option.subtitle && (
                            <span className="text-muted-foreground block truncate text-xs">
                              {option.subtitle}
                            </span>
                          )}
                        </span>
                        {renderOptionExtra?.(option)}
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

export { Combobox };
