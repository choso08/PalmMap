import { useCallback } from 'react';

import { savedStore } from './savedStore';
import type { TransitLineInfo } from './transit';

/**
 * Favourite lines (author's request, November 2026, "the favourites screen,
 * as Moovit"): starred on a line's panel, listed on the Saved screen, a tap
 * opens the line again.
 */
const LIMIT = 20;

const store = savedStore<TransitLineInfo[]>('palmmap.linhasFavoritas', [], (raw) =>
  Array.isArray(raw)
    ? (raw as TransitLineInfo[]).filter((l) => l && typeof l.id === 'string' && Array.isArray(l.patternIds))
    : [],
);

export const useFavouriteLines = store.useValue;

/** Whether a line is starred, and the toggle. */
export function useIsFavouriteLine(line: TransitLineInfo | null): [boolean, () => void] {
  const list = store.useValue();
  const on = line !== null && list.some((l) => l.id === line.id);
  const toggle = useCallback(() => {
    if (!line) {
      return;
    }
    store.update((now) =>
      now.some((l) => l.id === line.id)
        ? now.filter((l) => l.id !== line.id)
        : [line, ...now].slice(0, LIMIT),
    );
  }, [line]);
  return [on, toggle];
}
