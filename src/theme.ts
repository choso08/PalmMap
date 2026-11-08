/**
 * The app's colours, in light and dark versions.
 *
 * ## The idea: Island
 *
 * The name is PalmMap and the logo is a palm tree inside a pin. The colours
 * come from there: **sand, deep water and coral**. In light mode, the screen
 * is warm sand with petrol-coloured text; in dark mode, deep water with sand on
 * top. The accent is coral — the colour that stands out on sand and sea
 * without shouting.
 *
 * ## What drove the choices
 *
 * This is used while driving and in the sun, so pretty has to fit inside
 * legible. Two rules that must not be undone when changing things here:
 *
 * - **Text always clearly separated from the background.** No light greys on
 *   sand: the main text is nearly black, and the secondary text still reads in
 *   the sun.
 * - **Every important thing has its own colour.** The route is coral, the
 *   destination is water and businesses are amber. While driving there is no
 *   time to read legends.
 *
 * The **map**'s colours are separate, in `src/services/vectorStyle.ts`, and
 * follow this palette. When changing one, look at the other.
 *
 * Only the palettes live here. What decides which one is used is the
 * `SettingsProvider` in `src/settings.tsx`, which combines the phone's theme
 * with the stored preference. The `useTheme()` hook is there too.
 */
export interface Theme {
  dark: boolean;
  /** Screen background, under the map. */
  background: string;
  /** Background of the panels and the search bar. */
  surface: string;
  /** Background of unselected category buttons. */
  surfaceMuted: string;
  /** Main text. */
  text: string;
  /** Secondary text: addresses, captions. */
  textMuted: string;
  /** Placeholder text inside the search box. */
  placeholder: string;
  /** Accent colour: buttons, route, links. */
  accent: string;
  /** Text on top of the accent colour. */
  onAccent: string;
  /** Separator lines. */
  border: string;
  /** Error messages. */
  danger: string;
  /** Destination marker. */
  destination: string;
  /** Business pins. */
  poi: string;
  /** Pin outline, so they stand out from the map. */
  poiOutline: string;
  /**
   * Moving buses, on the map.
   *
   * It has to stand apart from the stops, which are the closest similar thing:
   * a stop is always in the same place, a bus moves. Hence its own colour
   * rather than one of the existing ones.
   */
  vehicle: string;
  /** Background of the floating messages over the map. */
  overlay: string;
  /** Text of those messages. */
  onOverlay: string;
  /**
   * The colours of the speed-limit sign.
   *
   * They are the same in both palettes on purpose: it is a road sign, and what
   * makes it readable at a glance is that it is always the same. They are here
   * anyway because no component writes colours by hand.
   */
  signFace: string;
  signEdge: string;
  signInk: string;
}

export const light: Theme = {
  dark: false,
  background: '#EFE6D9',
  surface: '#FCF8F2',
  surfaceMuted: '#F5EDE1',
  text: '#1C2B33',
  textMuted: '#5F7079',
  placeholder: '#97A6AD',
  accent: '#D9634A',
  onAccent: '#FFFFFF',
  border: '#E3D8C8',
  danger: '#A8341F',
  // Deep water. The destination has to stand apart from the route, which is coral.
  destination: '#0F6E70',
  poi: '#C98526',
  poiOutline: '#FCF8F2',
  vehicle: '#2F7D32',
  overlay: 'rgba(24, 38, 45, 0.80)',
  onOverlay: '#FCF8F2',
  signFace: '#FFFFFF',
  signEdge: '#D32F2F',
  signInk: '#111111',
};

export const dark: Theme = {
  dark: true,
  background: '#0B1319',
  surface: '#152230',
  // One step above `surface`, otherwise unselected buttons disappeared.
  surfaceMuted: '#1E2E3C',
  text: '#EDE5D8',
  textMuted: '#95A6B0',
  placeholder: '#6C7D87',
  // Lighter coral: the daytime one got lost against the deep water.
  accent: '#F2846B',
  onAccent: '#0B1319',
  border: '#25384A',
  danger: '#F08A72',
  destination: '#3FAAA6',
  poi: '#E0AC55',
  poiOutline: '#152230',
  vehicle: '#5FBF63',
  overlay: 'rgba(5, 11, 15, 0.86)',
  onOverlay: '#EDE5D8',
  signFace: '#FFFFFF',
  signEdge: '#D32F2F',
  signInk: '#111111',
};

export function themeFor(isDark: boolean): Theme {
  return isDark ? dark : light;
}
