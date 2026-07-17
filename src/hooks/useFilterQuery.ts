import * as React from 'react';

interface FilterQueryContextValue {
  query: string;
  setQuery: (query: string) => void;
}

export const FilterQueryContext = React.createContext<FilterQueryContextValue | null>(null);

/** Live search text from the nearest <FilterListRoot> (src/components/ui/filter-list.tsx). */
export function useFilterQuery(): FilterQueryContextValue {
  const ctx = React.useContext(FilterQueryContext);
  if (!ctx) throw new Error('useFilterQuery must be used within <FilterListRoot>');
  return ctx;
}
