import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';

import {
  resolveLanguage,
  setActiveLanguage,
  stringsFor,
  type Language,
  type LanguagePreference,
  type Strings,
} from './i18n';
import type { BikeType } from './services/valhalla';
import { type Theme, themeFor } from './theme';
import { blendPace, modelSeconds } from './utils/eta';

/**
 * The app's settings: kept on the phone and available to the whole app
 * through the context.
 */

/** How the map and the interface look. */
export type AppearanceMode = 'system' | 'light' | 'dark';

/**
 * The travel mode used to calculate the route.
 *
 * The first three are OSRM profiles. `transit` **is not**: public transport is
 * not calculated by a routing engine, it is put together from the stops'
 * arrival times — see `src/services/transit.ts`.
 */
export type TravelMode = 'driving' | 'walking' | 'cycling' | 'transit';

/** Only the three OSRM can calculate. `null` for public transport. */
export function osrmProfile(mode: TravelMode): 'driving' | 'walking' | 'cycling' | null {
  return mode === 'transit' ? null : mode;
}

/**
 * Drawn map, satellite imagery, the public transport network, or satellite
 * with the live buses and stops on top (`satelliteTransit`, the author's
 * request, November 2026).
 */
export type MapType = 'map' | 'satellite' | 'transit' | 'satelliteTransit';

/**
 * Whether this map type shows the live transport: stops to tap, moving buses,
 * the arrivals button. Both transport types do; only the base differs.
 */
export function isTransitMap(mapType: MapType): boolean {
  return mapType === 'transit' || mapType === 'satelliteTransit';
}

/**
 * How much detail is asked of the satellite imagery.
 *
 * `normal` is Sentinel-2, which covers the world but sees 10 metres per pixel.
 * `alta` adds the official orthophotos on top, which see under a metre — but
 * they only exist for Portugal and use far more data.
 */
export type SatelliteDetail = 'normal' | 'alta';

export interface Settings {
  /** The app's language. On `auto` it follows the phone's. */
  language: LanguagePreference;
  appearance: AppearanceMode;
  travelMode: TravelMode;
  /** The kind of bicycle: paved only, everyday, or anything goes (BTT). */
  bikeType: BikeType;
  /** Show businesses on the map by themselves, as one moves around. */
  showPlacesOnMap: boolean;
  /** Read the instructions aloud while navigating. */
  voiceGuidance: boolean;
  /** Drawn map, satellite imagery or transport. */
  mapType: MapType;
  /** How much detail is asked of the satellite imagery. */
  satelliteDetail: SatelliteDetail;
  /** Warn about speed cameras and speed checks while navigating. */
  speedCameraAlerts: boolean;
  /** Warn, as Waze does, when going over the road's speed limit (OSM maxspeed). */
  speedLimitAlerts: boolean;
  /** Ask OSRM for a route avoiding toll roads. */
  avoidTolls: boolean;
  /** Read the GPS less often while the next manoeuvre is still far away. */
  batterySaver: boolean;
  /**
   * Show the current speed while navigating.
   *
   * It costs no battery at all: the speed comes inside the GPS readings
   * navigation makes anyway.
   */
  showSpeed: boolean;
  /**
   * Show the moving buses, on the transport map type.
   *
   * On by default because it is the reason to open the transport map, but it
   * is the app's heaviest request — see `VEHICLES_MIN_ZOOM`.
   */
  showVehicles: boolean;
  /**
   * Learn the person's pace from trips and count on it in the arrival time
   * (see `utils/eta.ts`). Off, the routing service's time as it comes —
   * and nothing is measured or stored (author's request, November 2026).
   */
  paceLearning: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'auto',
  appearance: 'system',
  travelMode: 'driving',
  bikeType: 'normal',
  showPlacesOnMap: true,
  voiceGuidance: true,
  mapType: 'map',
  satelliteDetail: 'alta',
  speedCameraAlerts: true,
  speedLimitAlerts: false,
  avoidTolls: false,
  batterySaver: true,
  showSpeed: true,
  showVehicles: true,
  paceLearning: true,
};

/**
 * The map types, in the order the button cycles through them.
 *
 * The button always shows the **next** one's icon, not the current one's: that
 * is what a tap brings.
 */
export const MAP_TYPES: { id: MapType; icon: string }[] = [
  { id: 'map', icon: 'map-outline' },
  { id: 'satellite', icon: 'satellite-variant' },
  { id: 'transit', icon: 'bus' },
  { id: 'satelliteTransit', icon: 'bus-marker' },
];

/** The map type after this one, for the corner button. */
export function nextMapType(current: MapType): MapType {
  const i = MAP_TYPES.findIndex((t) => t.id === current);
  return MAP_TYPES[(i + 1) % MAP_TYPES.length].id;
}

export const SATELLITE_DETAILS: { id: SatelliteDetail; icon: string }[] = [
  { id: 'normal', icon: 'earth' },
  { id: 'alta', icon: 'magnify-plus-outline' },
];

export const TRAVEL_MODES: { id: TravelMode; icon: string }[] = [
  { id: 'driving', icon: 'car' },
  { id: 'walking', icon: 'walk' },
  { id: 'cycling', icon: 'bike' },
  { id: 'transit', icon: 'bus' },
];

export const LANGUAGES: { id: LanguagePreference; icon: string }[] = [
  { id: 'auto', icon: 'translate' },
  { id: 'pt', icon: 'alpha-p-box-outline' },
  { id: 'en', icon: 'alpha-e-box-outline' },
];

export const APPEARANCE_MODES: { id: AppearanceMode; icon: string }[] = [
  { id: 'system', icon: 'theme-light-dark' },
  { id: 'light', icon: 'white-balance-sunny' },
  { id: 'dark', icon: 'weather-night' },
];

const STORAGE_KEY = 'palmmap.settings';
/** Marks that high satellite detail was switched on once, as the new default. */
const SATELLITE_HIGH_KEY = 'palmmap.satelliteAltaPorDefeito';

/**
 * The pace the person really travels at, per travel mode.
 *
 * A factor: 1.3 means "takes a third longer than the routing service says". It
 * is measured while navigating and kept, so the next estimate is right from the
 * start — the one that matters is the one read **before** setting off.
 *
 * **It is not a setting, so it is not in the `Settings` type:** nobody chooses
 * it, the app learns it. It lives here rather than in a service of its own
 * because it has exactly the same lifecycle as the rest of what this file keeps.
 */
/**
 * Where a pace is kept: per travel mode, and **per bicycle type** — a slow BTT
 * ride must not slow down the road bike's estimates (author's request,
 * November 2026). The plain `cycling` key is what phones learnt before that,
 * one value for every bike; it is still read, only as a fallback until each
 * type has its own, and never written again.
 */
export type PaceKey = TravelMode | `cycling-${BikeType}`;

export type LearnedPace = Partial<Record<PaceKey, number>>;

export function paceKeyFor(mode: TravelMode, bikeType: BikeType): PaceKey {
  return mode === 'cycling' ? `cycling-${bikeType}` : mode;
}

/** The learnt pace for a mode (and bike type), with the old shared bike value as fallback. */
export function learnedPaceFor(
  pace: LearnedPace,
  mode: TravelMode,
  bikeType: BikeType,
): number | undefined {
  return pace[paceKeyFor(mode, bikeType)] ?? (mode === 'cycling' ? pace.cycling : undefined);
}

const PACE_KEY = 'palmmap.pace';

interface SettingsContextValue {
  settings: Settings;
  /** The learnt pace, per travel mode. Empty until something is measured. */
  pace: LearnedPace;
  /** Blends one trip's pace into what was already kept. */
  learnPace: (key: PaceKey, measured: number) => void;
  /** Forgets everything learnt. */
  forgetPace: () => void;
  theme: Theme;
  /** The language actually in use, with "automatic" already resolved. */
  language: Language;
  /** Os textos dessa língua. */
  strings: Strings;
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [pace, setPace] = useState<LearnedPace>({});

  // Reads the saved settings once, at startup.
  useEffect(() => {
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        // High satellite detail became the default in November 2026, at the
        // author's request. Settings are saved whole, so every phone had
        // 'normal' stored without anyone choosing it: switched once, and the
        // marker keeps a later choice of 'normal' from being undone.
        const highDefaultApplied = await AsyncStorage.getItem(SATELLITE_HIGH_KEY);
        if (!highDefaultApplied) {
          void AsyncStorage.setItem(SATELLITE_HIGH_KEY, '1').catch(() => undefined);
        }
        if (stored) {
          const merged: Settings = {
            // Merged with the defaults in case the app gained new settings since
            // they were last saved.
            ...DEFAULT_SETTINGS,
            ...JSON.parse(stored),
            // The map type is remembered too, at the author's request: closing
            // on satellite and reopening on the drawn map was the wrong way
            // round. An unknown value (from an older or newer version) falls
            // back to the drawn map.
            mapType: MAP_TYPES.some((m) => m.id === JSON.parse(stored).mapType)
              ? JSON.parse(stored).mapType
              : DEFAULT_SETTINGS.mapType,
            bikeType: ['road', 'normal', 'mtb'].includes(JSON.parse(stored).bikeType)
              ? JSON.parse(stored).bikeType
              : DEFAULT_SETTINGS.bikeType,
          };
          if (!highDefaultApplied && merged.satelliteDetail !== 'alta') {
            merged.satelliteDetail = 'alta';
            void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged)).catch(() => undefined);
          }
          setSettings(merged);
        }
      } catch {
        // With no saved settings, the defaults stay. No reason to fail.
      }

      try {
        const stored = await AsyncStorage.getItem(PACE_KEY);
        if (stored) {
          setPace(JSON.parse(stored));
        }
      } catch {
        // With no saved pace, the estimate is the service's until one is measured.
      }
    })();
  }, []);

  const update = useCallback<SettingsContextValue['update']>((key, value) => {
    setSettings((current) => {
      const next = { ...current, [key]: value };
      // Saving is secondary: if it fails, the setting still holds this session.
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);

  /**
   * Keeps the pace of a trip that just ended.
   *
   * Saving is secondary, as with the settings: if it fails, the value still
   * holds this session.
   */
  const learnPace = useCallback((key: PaceKey, measured: number) => {
    setPace((current) => {
      // A bike type with nothing of its own yet starts from the old shared value.
      const before =
        current[key] ?? (key.startsWith('cycling-') ? current.cycling : undefined);
      const next = { ...current, [key]: blendPace(before, measured) };
      void AsyncStorage.setItem(PACE_KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);

  const forgetPace = useCallback(() => {
    setPace({});
    void AsyncStorage.removeItem(PACE_KEY).catch(() => undefined);
  }, []);

  const value = useMemo<SettingsContextValue>(() => {
    const isDark =
      settings.appearance === 'system'
        ? systemScheme === 'dark'
        : settings.appearance === 'dark';

    const language = resolveLanguage(settings.language);

    // Services cannot use hooks and read the language from a module variable.
    // This is where it is set — the same place the preference is resolved, so
    // there are not two sources of the same truth.
    setActiveLanguage(language);

    return {
      settings,
      pace,
      learnPace,
      forgetPace,
      theme: themeFor(isDark),
      language,
      strings: stringsFor(language),
      update,
    };
  }, [settings, pace, learnPace, forgetPace, systemScheme, update]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

function useSettingsContext(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('SettingsProvider is missing around the app.');
  }
  return context;
}

/** The current settings and how to change them. */
export function useSettings() {
  const { settings, update } = useSettingsContext();
  return { settings, update };
}

/**
 * The time shown, from what the routing service answered.
 *
 * It takes the distance **and** the duration because the cycling model needs
 * both — see `modelSeconds`. The third argument is the pace measured on this
 * trip, which only the navigation screen has; other screens leave it out and
 * get what was learnt from earlier trips.
 *
 * The order is always the same: **this trip's beats the learnt one, and the
 * learnt one beats the service's time as it came** — see `utils/eta.ts`.
 */
export function useEta(): (
  distanceMeters: number,
  osrmSeconds: number,
  livePace?: number | null,
  /** Another mode than the chosen one — for the times on the mode chips. */
  forMode?: TravelMode,
) => number {
  const { settings, pace } = useSettingsContext();
  const mode = settings.travelMode;
  const learning = settings.paceLearning;
  const bikeType = settings.bikeType;

  return useCallback(
    (distanceMeters, osrmSeconds, livePace, forMode) => {
      const m = forMode ?? mode;
      // With learning off, the routing service's time as it came (the manual
      // ×1.25–×2 correction was removed at the author's request, November
      // 2026: the learnt pace does the same job, measured instead of guessed).
      const factor = learning ? (livePace ?? learnedPaceFor(pace, m, bikeType) ?? 1) : 1;
      return modelSeconds(distanceMeters, osrmSeconds, m) * factor;
    },
    [mode, pace, learning, bikeType],
  );
}

/** The learnt pace and how to forget it, for the Settings screen. */
export function useLearnedPace() {
  const { pace, learnPace, forgetPace } = useSettingsContext();
  return { pace, learnPace, forgetPace };
}

/**
 * The colours to use now, counting the saved preference and the phone's theme.
 */
export function useTheme(): Theme {
  return useSettingsContext().theme;
}

/**
 * The texts in the current language.
 *
 * A hook on purpose: a component then redraws when the language changes,
 * without restarting the app. Whoever cannot use hooks — the services — has
 * `t()` from `src/i18n`.
 */
export function useT(): Strings {
  return useSettingsContext().strings;
}

/** The language actually in use, for whoever needs the code rather than the text. */
export function useLanguage(): Language {
  return useSettingsContext().language;
}
