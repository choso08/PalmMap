import { savedStore } from './savedStore';
import { t } from '../i18n';
import type { Place } from '../types/geo';

/**
 * Home and Work, the two shortcuts at the top of the Saved screen, as Moovit
 * and Maps have them (author's request, November 2026). Each is one of the
 * person's places, picked on that screen; a tap there makes it the
 * destination.
 *
 * **And labels of one's own** (author: "more customisable location tags",
 * 19 November 2026), as Google's "Labelled": a name and an icon the person
 * picks ("Gym", "Mum's"), each pointing at one place. They go wherever Home
 * and Work go — the Saved screen, the empty search's chips, the picker
 * screen with "Choose on map", a dropped pin's name — through the same
 * `HomeWorkKind`: `label:<id>`.
 */
export type HomeWorkKind = 'home' | 'work' | `label:${string}`;
export type HomeWork = Record<'home' | 'work', Place | null>;

export interface PlaceLabel {
  id: string;
  name: string;
  /** A MaterialCommunityIcons name from `LABEL_ICONS`, or an emoji the person typed. */
  icon: string;
  /** The chip's colour, from `LABEL_COLOURS`. */
  colour: string;
  place: Place | null;
}

/**
 * The colours a label can take (author: "if the tag could really be
 * customised", 19 November 2026): bright enough for a white icon on top.
 */
export const LABEL_COLOURS = [
  '#0B7C74',
  '#2563EB',
  '#7C3AED',
  '#DB2777',
  '#DC2626',
  '#EA580C',
  '#CA8A04',
  '#16A34A',
  '#475569',
] as const;

/** An emoji typed as the icon: short and not plain letters. */
export function isEmojiIcon(icon: string): boolean {
  return icon.length > 0 && icon.length <= 8 && !/^[a-z-]+$/.test(icon);
}

function cleanIcon(icon: unknown): string {
  if (typeof icon !== 'string') {
    return 'map-marker';
  }
  if ((LABEL_ICONS as readonly string[]).includes(icon) || isEmojiIcon(icon)) {
    return icon;
  }
  return 'map-marker';
}

/** The icons a label can take: few, recognisable, all checked in the font. */
export const LABEL_ICONS = [
  'map-marker',
  'star',
  'home-heart',
  'office-building',
  'bed',
  'baby-face-outline',
  'gamepad-variant',
  'music',
  'book-open-variant',
  'bank',
  'gas-station',
  'parking',
  'bus',
  'train',
  'bike',
  'pine-tree',
  'fish',
  'silverware-fork-knife',
  'glass-cocktail',
  'pill',
  'tooth',
  'scissors-cutting',
  'paw',
  'heart',
  'account-group',
  'school',
  'dumbbell',
  'food',
  'coffee',
  'cart',
  'hospital-box',
  'beach',
  'tree',
  'soccer',
  'church',
  'dog',
  'car',
  'airplane',
] as const;

const isPlace = (p: unknown): p is Place =>
  !!p && typeof p === 'object' && 'coordinates' in p && typeof (p as Place).name === 'string';

const store = savedStore<HomeWork>('palmmap.casaTrabalho', { home: null, work: null }, (raw) => {
  const r = (raw ?? {}) as Partial<HomeWork>;
  return { home: isPlace(r.home) ? r.home : null, work: isPlace(r.work) ? r.work : null };
});

/** At most this many labels: a row of chips, not a second list of favourites. */
export const LABELS_MAX = 20;

const labels = savedStore<PlaceLabel[]>('palmmap.etiquetas', [], (raw) =>
  (Array.isArray(raw) ? raw : [])
    .filter(
      (l): l is PlaceLabel =>
        !!l && typeof l === 'object' && typeof l.id === 'string' && typeof l.name === 'string',
    )
    .map((l) => ({
      id: l.id,
      name: l.name.slice(0, 40),
      icon: cleanIcon(l.icon),
      colour: (LABEL_COLOURS as readonly string[]).includes(l.colour) ? l.colour : LABEL_COLOURS[0],
      place: isPlace(l.place) ? l.place : null,
    }))
    .slice(0, LABELS_MAX),
);

export const useHomeWork = store.useValue;
export const loadHomeWork = store.load;
export const homeWorkNow = store.current;
export const useLabels = labels.useValue;
export const labelsNow = labels.current;
export const loadLabels = labels.load;

function labelId(kind: HomeWorkKind): string | null {
  return kind.startsWith('label:') ? kind.slice(6) : null;
}

/** The label behind a kind, or null for Home and Work (or a deleted label). */
export function labelOf(kind: HomeWorkKind, list: PlaceLabel[] = labels.current()): PlaceLabel | null {
  const id = labelId(kind);
  return id ? (list.find((l) => l.id === id) ?? null) : null;
}

/** The place a kind points at now. */
export function placeOf(
  kind: HomeWorkKind,
  homeWork: HomeWork = store.current(),
  list: PlaceLabel[] = labels.current(),
): Place | null {
  if (kind === 'home' || kind === 'work') {
    return homeWork[kind];
  }
  return labelOf(kind, list)?.place ?? null;
}

/** The kind's name: "Casa", "Trabalho", or the label's own. */
export function kindName(kind: HomeWorkKind, list: PlaceLabel[] = labels.current()): string {
  if (kind === 'home' || kind === 'work') {
    return t().saved[kind];
  }
  return labelOf(kind, list)?.name ?? '';
}

/** The kind's colour, or null for Home and Work (the theme's accent). */
export function kindColour(kind: HomeWorkKind, list: PlaceLabel[] = labels.current()): string | null {
  return labelOf(kind, list)?.colour ?? null;
}

/** The kind's icon. */
export function kindIcon(kind: HomeWorkKind, list: PlaceLabel[] = labels.current()): string {
  if (kind === 'home') {
    return 'home';
  }
  if (kind === 'work') {
    return 'briefcase';
  }
  return labelOf(kind, list)?.icon ?? 'map-marker';
}

/** Sets or clears where one of them points. */
export function setHomeWork(kind: HomeWorkKind, place: Place | null): void {
  const id = labelId(kind);
  if (id) {
    labels.update((now) => now.map((l) => (l.id === id ? { ...l, place } : l)));
    return;
  }
  store.update((now) => ({ ...now, [kind]: place }));
}

/** A new label; returns its kind. */
export function addLabel(
  name: string,
  icon: string,
  colour: string,
  place: Place | null = null,
): HomeWorkKind {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  labels.update((now) =>
    [...now, { id, name: name.trim().slice(0, 40), icon: cleanIcon(icon), colour, place }].slice(0, LABELS_MAX),
  );
  return `label:${id}`;
}

/** Renames a label or changes its icon or colour. */
export function editLabel(kind: HomeWorkKind, name: string, icon: string, colour: string): void {
  const id = labelId(kind);
  if (id) {
    labels.update((now) =>
      now.map((l) =>
        l.id === id ? { ...l, name: name.trim().slice(0, 40), icon: cleanIcon(icon), colour } : l,
      ),
    );
  }
}

export function removeLabel(kind: HomeWorkKind): void {
  const id = labelId(kind);
  if (id) {
    labels.update((now) => now.filter((l) => l.id !== id));
  }
}
