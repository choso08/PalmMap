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
 * A correction to the estimated time.
 *
 * OSRM works the time out from the road type and OpenStreetMap's `surface`
 * tag. Where that tag is missing — and it is in many places — it assumes a good
 * surface and is too optimistic. This allows correcting it by hand.
 */
export type TimeAdjustment = 'none' | 'slow' | 'slower' | 'slowest';

/** How much of the map already seen is kept on the phone. `off` turns the cache off. */
export type CacheSize = 'off' | 'small' | 'medium' | 'large' | 'huge';

/** Drawn map, satellite imagery or the public transport network. */
export type MapType = 'map' | 'satellite' | 'transit';

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
  /** Show businesses on the map by themselves, as one moves around. */
  showPlacesOnMap: boolean;
  /** Read the instructions aloud while navigating. */
  voiceGuidance: boolean;
  /** The correction applied to the estimated time. */
  timeAdjustment: TimeAdjustment;
  /** How much of the map already seen is kept. */
  cacheSize: CacheSize;
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
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'auto',
  appearance: 'system',
  travelMode: 'driving',
  showPlacesOnMap: true,
  voiceGuidance: true,
  timeAdjustment: 'none',
  cacheSize: 'medium',
  mapType: 'map',
  satelliteDetail: 'normal',
  speedCameraAlerts: true,
  speedLimitAlerts: false,
  avoidTolls: false,
  batterySaver: true,
  showSpeed: true,
  showVehicles: true,
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

export const CACHE_SIZES: {
  id: CacheSize;
  icon: string;
  megabytes: number;
}[] = [
  { id: 'off', icon: 'close-circle-outline', megabytes: 0 },
  { id: 'small', icon: 'sd', megabytes: 100 },
  { id: 'medium', icon: 'database-outline', megabytes: 250 },
  { id: 'large', icon: 'database', megabytes: 500 },
  { id: 'huge', icon: 'harddisk', megabytes: 1024 },
];

export const TIME_ADJUSTMENTS: {
  id: TimeAdjustment;
  icon: string;
  factor: number;
}[] = [
  { id: 'none', icon: 'speedometer', factor: 1 },
  { id: 'slow', icon: 'speedometer-medium', factor: 1.25 },
  { id: 'slower', icon: 'speedometer-slow', factor: 1.5 },
  { id: 'slowest', icon: 'road-variant', factor: 2 },
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
export type LearnedPace = Partial<Record<TravelMode, number>>;

const PACE_KEY = 'palmmap.pace';

interface SettingsContextValue {
  settings: Settings;
  /** The learnt pace, per travel mode. Empty until something is measured. */
  pace: LearnedPace;
  /** Blends one trip's pace into what was already kept. */
  learnPace: (mode: TravelMode, measured: number) => void;
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
        if (stored) {
          setSettings({
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
          });
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
  const learnPace = useCallback((mode: TravelMode, measured: number) => {
    setPace((current) => {
      const next = { ...current, [mode]: blendPace(current[mode], measured) };
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

/** How many megabytes to keep, for the chosen setting. */
export function cacheMegabytesFor(size: CacheSize): number {
  return CACHE_SIZES.find((option) => option.id === size)?.megabytes ?? 250;
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
 * learnt one beats the manual correction.** Measured beats guessed, and they
 * are never multiplied — see the note at the top of `utils/eta.ts`.
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
  const manual =
    TIME_ADJUSTMENTS.find((option) => option.id === settings.timeAdjustment)?.factor ?? 1;

  return useCallback(
    (distanceMeters, osrmSeconds, livePace, forMode) => {
      const m = forMode ?? mode;
      return modelSeconds(distanceMeters, osrmSeconds, m) * (livePace ?? pace[m] ?? manual);
    },
    [mode, pace, manual],
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
