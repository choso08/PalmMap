import { t } from '../i18n';

/**
 * Categories of businesses and places.
 *
 * Two roles:
 * - `SEARCH_CATEGORIES` are the quick-search buttons ("Restaurants", …) and
 *   know how to ask Overpass for them.
 * - `categoryLabel()` turns OpenStreetMap tags into readable text, and serves
 *   both Overpass and Nominatim.
 *
 * **The names are not here.** They are in each language's table, and these
 * structures only keep the key — otherwise switching language would mean
 * touching this list, which is about something else: what to ask
 * OpenStreetMap.
 */

export interface SearchCategory {
  id: string;
  /** The name's key in the language table. See `categoryTitle()`. */
  labelKey: keyof ReturnType<typeof t>['categories'];
  /** Icon name, from the MaterialCommunityIcons family. */
  icon: string;
  /** OpenStreetMap tags that correspond to this category. */
  tags: { key: string; values: string[] }[];
}

export const SEARCH_CATEGORIES: SearchCategory[] = [
  {
    id: 'food',
    labelKey: 'restaurants',
    icon: 'silverware-fork-knife',
    tags: [{ key: 'amenity', values: ['restaurant', 'fast_food'] }],
  },
  {
    id: 'cafe',
    labelKey: 'cafes',
    icon: 'coffee',
    tags: [{ key: 'amenity', values: ['cafe', 'bar', 'pub'] }],
  },
  {
    id: 'pharmacy',
    labelKey: 'pharmacies',
    icon: 'pill',
    tags: [{ key: 'amenity', values: ['pharmacy'] }],
  },
  {
    id: 'fuel',
    labelKey: 'fuel',
    icon: 'gas-station',
    tags: [{ key: 'amenity', values: ['fuel', 'charging_station'] }],
  },
  {
    id: 'shopping',
    labelKey: 'supermarkets',
    icon: 'cart',
    tags: [{ key: 'shop', values: ['supermarket', 'convenience'] }],
  },
  {
    id: 'money',
    labelKey: 'atm',
    icon: 'cash',
    tags: [{ key: 'amenity', values: ['atm', 'bank'] }],
  },
  {
    id: 'parking',
    labelKey: 'parking',
    icon: 'parking',
    tags: [{ key: 'amenity', values: ['parking'] }],
  },
  {
    id: 'health',
    labelKey: 'health',
    icon: 'hospital-box',
    tags: [{ key: 'amenity', values: ['hospital', 'clinic', 'doctors', 'dentist'] }],
  },
];

/**
 * Tags that matter when businesses are shown automatically on the map.
 * Deliberately limited: showing everything OpenStreetMap has fills the screen
 * and forces much bigger requests.
 */
export const MAP_PIN_TAGS: { key: string; values: string[] | null }[] = [
  {
    key: 'amenity',
    values: [
      'restaurant',
      'fast_food',
      'cafe',
      'bar',
      'pub',
      'pharmacy',
      'fuel',
      'charging_station',
      'bank',
      'atm',
      'hospital',
      'clinic',
      'parking',
      'post_office',
    ],
  },
  // `null` means "any value" — any shop counts.
  { key: 'shop', values: null },
  { key: 'tourism', values: ['hotel', 'hostel', 'guest_house', 'museum'] },
];

/**
 * Returns the kind of place as readable text, from the OpenStreetMap tags.
 * Returns `undefined` when nothing useful is recognised.
 */
export function categoryLabel(tags: Record<string, string> | undefined): string | undefined {
  if (!tags) {
    return undefined;
  }

  for (const key of ['amenity', 'shop', 'tourism', 'leisure', 'office']) {
    const value = tags[key];
    if (!value) {
      continue;
    }
    const known = (t().placeKinds as Record<string, string>)[value];
    if (known) {
      return known;
    }
    // No known translation: use the value itself, with underscores turned
    // into spaces, which beats showing nothing.
    return value.replace(/_/g, ' ');
  }

  return undefined;
}

/** A category's name, in the current language. */
export function categoryTitle(category: SearchCategory): string {
  return t().categories[category.labelKey];
}
