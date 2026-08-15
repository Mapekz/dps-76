import * as React from 'react';
import { SearchIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { FilterQueryContext, useFilterQuery } from '@/hooks/useFilterQuery';

/**
 * Lightweight, non-cmdk replacement for the "searchable action list" pattern
 * (perk add, food/drink add): a Popover-hosted list where clicking a row
 * dispatches an action and the popup stays open for repeated picks, rather
 * than a single-value combobox that closes on select. Unlike cmdk, rows are
 * plain focusable buttons - Tab/Enter/Space work, but there's no arrow-key
 * roving focus or typeahead; callers own filtering (via matchesQuery, see
 * src/lib/filter-query.ts) and the empty state instead of it being derived
 * automatically.
 */

function FilterListRoot({ children }: { children: React.ReactNode }) {
  const [query, setQuery] = React.useState('');
  const value = React.useMemo(() => ({ query, setQuery }), [query]);
  return (
    <FilterQueryContext.Provider value={value}>
      <div
        data-slot="filter-list"
        className="bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden rounded-none"
      >
        {children}
      </div>
    </FilterQueryContext.Provider>
  );
}

function FilterInput({ placeholder }: { placeholder?: string }) {
  const { query, setQuery } = useFilterQuery();
  return (
    <div
      data-slot="filter-input-wrapper"
      className="flex h-10 items-center gap-2 border-b border-input px-3"
    >
      <SearchIcon className="size-3.5 shrink-0 opacity-50" />
      <input
        data-slot="filter-input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="placeholder:text-muted-foreground flex h-10 w-full bg-transparent py-3 text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}

function FilterList({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="filter-list-scroll"
      className={cn('max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto', className)}
      {...props}
    />
  );
}

/** Caller computes `show` (e.g. every group's filtered items ended up empty). */
function FilterEmpty({ show, children }: { show: boolean; children: React.ReactNode }) {
  if (!show) return null;
  return (
    <div data-slot="filter-empty" className="py-6 text-center text-sm">
      {children}
    </div>
  );
}

function FilterGroup({
  heading,
  children,
}: {
  heading?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div data-slot="filter-group" className="text-foreground overflow-hidden p-1">
      {heading !== undefined && (
        <div className="px-3 py-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          {heading}
        </div>
      )}
      {children}
    </div>
  );
}

// forwardRef so a FilterItem can itself be a Tooltip's `render` target (Base
// UI's composition pattern needs the ref to anchor the popup) — PerkEditorSection
// and ArmorSection both wrap one in a Tooltip for the "Right-click to
// lower/remove" hint.
const FilterItem = React.forwardRef<HTMLButtonElement, React.ComponentProps<'button'>>(
  ({ className, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        data-slot="filter-item"
        disabled={disabled}
        className={cn(
          "hover:bg-accent hover:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-default items-center gap-2 rounded-none px-2 py-1.5 text-left text-sm outline-hidden select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          className,
        )}
        {...props}
      />
    );
  },
);
FilterItem.displayName = 'FilterItem';

export { FilterListRoot, FilterInput, FilterList, FilterEmpty, FilterGroup, FilterItem };
