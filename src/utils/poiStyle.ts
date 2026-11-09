import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';

/**
 * How each kind of business looks on the map: an icon and a family colour, the
 * way the maps apps people already know draw them — food orange, shopping
 * blue, health red, lodging pink, services grey-blue, leisure green.
 *
 * The icons are PNGs in `assets/poi/`, drawn by `scripts/generate-poi-icons.py`
 * from the same MaterialCommunityIcons the buttons use. **The colours live in
 * two places on purpose**: here, for the label text, and in that script, baked
 * into the PNGs. Change one, change the other and run the script again.
 *
 * The same colours serve both themes, as in other maps apps: they are saturated
 * enough to read on the light map and on the dark one.
 */

export type PoiFamily = 'food' | 'shop' | 'health' | 'lodging' | 'service' | 'leisure' | 'other';

export const POI_FAMILY_COLOURS: Record<PoiFamily, string> = {
  food: '#E8710A',
  shop: '#1A73E8',
  health: '#D93025',
  lodging: '#C2185B',
  service: '#5F6F86',
  leisure: '#188038',
  other: '#6B7480',
};

/** Icon name (file `assets/poi/<icon>.png`) and family, by OpenStreetMap value. */
const BY_VALUE: Record<string, [string, PoiFamily]> = {
  restaurant: ['silverware-fork-knife', 'food'],
  fast_food: ['silverware-fork-knife', 'food'],
  food_court: ['silverware-fork-knife', 'food'],
  cafe: ['coffee', 'food'],
  bar: ['glass-cocktail', 'food'],
  pub: ['glass-cocktail', 'food'],
  biergarten: ['glass-cocktail', 'food'],
  ice_cream: ['coffee', 'food'],
  bakery: ['coffee', 'food'],
  pastry: ['coffee', 'food'],
  confectionery: ['coffee', 'food'],
  wine: ['glass-cocktail', 'food'],
  alcohol: ['glass-cocktail', 'food'],

  supermarket: ['cart', 'shop'],
  convenience: ['cart', 'shop'],
  grocery: ['cart', 'shop'],
  greengrocer: ['cart', 'shop'],
  butcher: ['cart', 'shop'],
  clothes: ['shopping', 'shop'],
  clothing_store: ['shopping', 'shop'],
  shoes: ['shopping', 'shop'],
  hairdresser: ['shopping', 'shop'],
  beauty: ['shopping', 'shop'],
  mobile_phone: ['shopping', 'shop'],
  electronics: ['shopping', 'shop'],
  furniture: ['shopping', 'shop'],
  florist: ['shopping', 'shop'],
  books: ['shopping', 'shop'],
  pet: ['shopping', 'shop'],
  car: ['office-building', 'service'],
  car_repair: ['office-building', 'service'],

  pharmacy: ['plus-thick', 'health'],
  chemist: ['plus-thick', 'health'],
  hospital: ['plus-thick', 'health'],
  clinic: ['plus-thick', 'health'],
  doctors: ['plus-thick', 'health'],
  dentist: ['plus-thick', 'health'],
  veterinary: ['plus-thick', 'health'],

  hotel: ['bed', 'lodging'],
  hostel: ['bed', 'lodging'],
  guest_house: ['bed', 'lodging'],
  motel: ['bed', 'lodging'],
  apartment: ['bed', 'lodging'],
  lodging: ['bed', 'lodging'],
  camp_site: ['bed', 'lodging'],

  fuel: ['gas-station', 'service'],
  charging_station: ['gas-station', 'service'],
  bank: ['cash', 'service'],
  atm: ['cash', 'service'],
  bureau_de_change: ['cash', 'service'],
  parking: ['parking', 'service'],
  post_office: ['office-building', 'service'],
  post: ['office-building', 'service'],
  townhall: ['office-building', 'service'],
  town_hall: ['office-building', 'service'],
  police: ['office-building', 'service'],
  place_of_worship: ['office-building', 'service'],

  museum: ['camera', 'leisure'],
  attraction: ['camera', 'leisure'],
  viewpoint: ['camera', 'leisure'],
  theatre: ['camera', 'leisure'],
  cinema: ['camera', 'leisure'],
  park: ['tree', 'leisure'],
  fitness_centre: ['tree', 'leisure'],
  sports_centre: ['tree', 'leisure'],
  school: ['camera', 'leisure'],
  college: ['camera', 'leisure'],
  university: ['camera', 'leisure'],
  library: ['camera', 'leisure'],
};

/** When the value is not known, the key (or tile class) still says the family. */
const BY_KEY: Record<string, [string, PoiFamily]> = {
  shop: ['shopping', 'shop'],
  amenity: ['map-marker', 'other'],
  tourism: ['camera', 'leisure'],
  leisure: ['tree', 'leisure'],
  healthcare: ['plus-thick', 'health'],
  office: ['office-building', 'service'],
  craft: ['shopping', 'shop'],
};

const FALLBACK: [string, PoiFamily] = ['map-marker', 'other'];

/** The image name for an icon in a family: `food-coffee` → `assets/poi/food-coffee.png`. */
function imageName(icon: string, family: PoiFamily): string {
  return `${family}-${icon}`;
}

/**
 * Every image the map uses, for the `Images` component and for the script.
 * The colour is baked into each PNG, so the same glyph in two families is two
 * images (a paw is a pet shop in blue and a vet in red).
 */
export const POI_IMAGES: string[] = Array.from(
  new Set(
    [...Object.values(BY_VALUE), ...Object.values(BY_KEY), FALLBACK].map(([icon, family]) =>
      imageName(icon, family),
    ),
  ),
).sort();

/**
 * Which families come first when pins compete for room: the lower, the sooner
 * it wins. Food and health are what people look for most.
 */
const PRIORITY: Record<PoiFamily, number> = {
  food: 0,
  health: 1,
  shop: 2,
  lodging: 3,
  leisure: 4,
  service: 5,
  other: 6,
};

export interface PoiLook {
  /** The image name, as registered with the map. */
  icon: string;
  family: PoiFamily;
  colour: string;
  priority: number;
}

/** The look of a business from its OpenStreetMap key and value. */
export function poiLook(key?: string, value?: string): PoiLook {
  const [icon, family] =
    (value && BY_VALUE[value]) || (key && BY_KEY[key]) || FALLBACK;
  return {
    icon: imageName(icon, family),
    family,
    colour: POI_FAMILY_COLOURS[family],
    priority: PRIORITY[family],
  };
}

/**
 * The same table as a style expression, for the OpenFreeMap tiles — their
 * features are not ours, so the look has to be worked out on the map itself.
 * `subclass` is the raw OpenStreetMap value; when it is unknown, `class`
 * (`shop`, `grocery`, `lodging`…) still gives the family.
 */
function tileMatch(pick: (entry: [string, PoiFamily]) => string | number): ExpressionSpecification {
  const valueCases: (string | number)[] = [];
  for (const [value, entry] of Object.entries(BY_VALUE)) {
    valueCases.push(value, pick(entry));
  }
  const classCases: (string | number)[] = [];
  for (const [value, entry] of Object.entries({ ...BY_KEY, ...BY_VALUE })) {
    classCases.push(value, pick(entry));
  }
  return [
    'match',
    ['coalesce', ['get', 'subclass'], ''],
    ...valueCases,
    ['match', ['coalesce', ['get', 'class'], ''], ...classCases, pick(FALLBACK)],
  ] as unknown as ExpressionSpecification;
}

export const TILE_POI_ICON = tileMatch(([icon, family]) => imageName(icon, family));
export const TILE_POI_COLOUR = tileMatch(([, family]) => POI_FAMILY_COLOURS[family]);
export const TILE_POI_PRIORITY = tileMatch(([, family]) => PRIORITY[family]);
