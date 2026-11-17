/**
 * The app's colours, in light and dark versions.
 *
 * ## The idea: Lagoon
 *
 * Until November 2026 the app was sand, petrol and coral ("Island"); the
 * author found it heavy and asked for combinations that look modern. Now:
 * **cool near-white surfaces, ink text and one vivid accent, lagoon teal** —
 * the shallow water around the palm's island. In dark mode, near-black blue
 * greys with a brighter teal. Colour is kept for what means something; the
 * rest is neutral, which is what makes a screen feel light.
 *
 * ## What drove the choices
 *
 * This is used while driving and in the sun, so pretty has to fit inside
 * legible. Two rules that must not be undone when changing things here:
 *
 * - **Text always clearly separated from the background.** The main text is
 *   nearly black, the secondary text at least 4.5:1 on every surface, and
 *   the accent at least 4.5:1 against white and every light surface, as text
 *   on them and under white text.
 * - **Every important thing has its own colour.** The route is teal, the
 *   destination violet and businesses amber. While driving there is no time
 *   to read legends.
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
  /** A darker accent, for the navigation "Then" tab under the banner. */
  accentDeep: string;
  /** Text on top of the accent colour. */
  onAccent: string;
  /** Separator lines. */
  border: string;
  /** Error messages. */
  danger: string;
  /** "Open" on a place card. */
  open: string;
  /** "Closes soon" on a place card. */
  closingSoon: string;
  /** Destination marker. */
  destination: string;
  /** Business pins. */
  poi: string;
  /** Pin outline, so they stand out from the map. */
  poiOutline: string;
  /** The big red pin of the chosen place, and its outline and glyph. */
  pin: string;
  pinOutline: string;
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
  /** The scale bar: its ink, the halo round its text and its faint pill. */
  scaleInk: string;
  scaleHalo: string;
  scalePill: string;
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
  background: '#F3F5F8',
  surface: '#FFFFFF',
  surfaceMuted: '#EEF2F6',
  text: '#0F172A',
  textMuted: '#556070',
  placeholder: '#98A2B0',
  accent: '#0B7C74',
  accentDeep: '#09615B',
  onAccent: '#FFFFFF',
  border: '#E2E7ED',
  danger: '#D92D20',
  open: '#15803D',
  closingSoon: '#D97706',
  // Violet: it has to stand apart from the route, which is teal.
  destination: '#6D5DFC',
  poi: '#F59E0B',
  poiOutline: '#FFFFFF',
  pin: '#EA4335',
  pinOutline: '#FFFFFF',
  vehicle: '#2563EB',
  overlay: 'rgba(15, 23, 42, 0.82)',
  onOverlay: '#F8FAFC',
  scaleInk: '#1F1F1F',
  scaleHalo: 'rgba(255, 255, 255, 0.9)',
  scalePill: 'rgba(255, 255, 255, 0.7)',
  signFace: '#FFFFFF',
  signEdge: '#D32F2F',
  signInk: '#111111',
};

export const dark: Theme = {
  dark: true,
  background: '#0B0F14',
  surface: '#151B23',
  // One step above `surface`, otherwise unselected buttons disappeared.
  surfaceMuted: '#212934',
  text: '#E6EDF3',
  textMuted: '#9AA6B2',
  placeholder: '#6B7682',
  // A brighter teal: the daytime one got lost against the dark.
  accent: '#2DD4BF',
  accentDeep: '#0F766E',
  onAccent: '#042F2B',
  border: '#28313C',
  danger: '#F87171',
  open: '#4ADE80',
  closingSoon: '#FBBF24',
  destination: '#A59BFF',
  poi: '#FBBF24',
  poiOutline: '#151B23',
  pin: '#EA4335',
  pinOutline: '#FFFFFF',
  vehicle: '#60A5FA',
  overlay: 'rgba(0, 0, 0, 0.82)',
  onOverlay: '#E6EDF3',
  scaleInk: '#FFFFFF',
  scaleHalo: 'rgba(0, 0, 0, 0.75)',
  scalePill: 'rgba(0, 0, 0, 0.45)',
  signFace: '#FFFFFF',
  signEdge: '#D32F2F',
  signInk: '#111111',
};

export function themeFor(isDark: boolean): Theme {
  return isDark ? dark : light;
}
