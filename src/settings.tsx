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

import { type Theme, themeFor } from './theme';

/**
 * Definições da aplicação: guardadas no telemóvel e disponíveis a toda a
 * aplicação através do contexto.
 */

/** Aspeto do mapa e da interface. */
export type AppearanceMode = 'system' | 'light' | 'dark';

/** Meio de transporte usado para calcular o percurso. */
export type TravelMode = 'driving' | 'walking' | 'cycling';

/**
 * Correção do tempo estimado.
 *
 * O OSRM calcula o tempo a partir do tipo de estrada e da etiqueta `surface` do
 * OpenStreetMap. Onde essa etiqueta falta — e falta em muitos sítios — ele
 * assume piso bom e fica optimista demais. Isto permite corrigir à mão.
 */
export type TimeAdjustment = 'none' | 'slow' | 'slower' | 'slowest';

/** Quanto do mapa já visto se guarda no telemóvel. `off` desliga a cache. */
export type CacheSize = 'off' | 'small' | 'medium' | 'large' | 'huge';

/** Mapa desenhado ou imagem de satélite. */
export type MapType = 'map' | 'satellite';

/**
 * Quanto detalhe se pede à imagem de satélite.
 *
 * `normal` é o Sentinel-2, que cobre o mundo mas vê a 10 metros por pixel.
 * `alta` acrescenta-lhe por cima as ortofotos oficiais, que vêem a menos de um
 * metro — mas só existem para Portugal, e gastam muito mais dados.
 */
export type SatelliteDetail = 'normal' | 'alta';

export interface Settings {
  appearance: AppearanceMode;
  travelMode: TravelMode;
  /** Mostrar negócios sozinhos no mapa, à medida que se navega. */
  showPlacesOnMap: boolean;
  /** Ler as instruções em voz alta durante a navegação. */
  voiceGuidance: boolean;
  /** Correção aplicada ao tempo estimado. */
  timeAdjustment: TimeAdjustment;
  /** Quanto do mapa já visto fica guardado. */
  cacheSize: CacheSize;
  /** Mapa desenhado ou imagem de satélite. */
  mapType: MapType;
  /** Quanto detalhe se pede à imagem de satélite. */
  satelliteDetail: SatelliteDetail;
}

export const DEFAULT_SETTINGS: Settings = {
  appearance: 'system',
  travelMode: 'driving',
  showPlacesOnMap: true,
  voiceGuidance: true,
  timeAdjustment: 'none',
  cacheSize: 'medium',
  mapType: 'map',
  satelliteDetail: 'normal',
};

export const SATELLITE_DETAILS: { id: SatelliteDetail; label: string; icon: string }[] = [
  { id: 'normal', label: 'Normal', icon: 'earth' },
  { id: 'alta', label: 'Alta', icon: 'magnify-plus-outline' },
];

export const CACHE_SIZES: {
  id: CacheSize;
  label: string;
  icon: string;
  megabytes: number;
}[] = [
  { id: 'off', label: 'Nada', icon: 'close-circle-outline', megabytes: 0 },
  { id: 'small', label: '100 MB', icon: 'sd', megabytes: 100 },
  { id: 'medium', label: '250 MB', icon: 'database-outline', megabytes: 250 },
  { id: 'large', label: '500 MB', icon: 'database', megabytes: 500 },
  { id: 'huge', label: '1 GB', icon: 'harddisk', megabytes: 1024 },
];

export const TIME_ADJUSTMENTS: {
  id: TimeAdjustment;
  label: string;
  icon: string;
  factor: number;
}[] = [
  { id: 'none', label: 'Normal', icon: 'speedometer', factor: 1 },
  { id: 'slow', label: '+25%', icon: 'speedometer-medium', factor: 1.25 },
  { id: 'slower', label: '+50%', icon: 'speedometer-slow', factor: 1.5 },
  { id: 'slowest', label: '+100%', icon: 'road-variant', factor: 2 },
];

export const TRAVEL_MODES: { id: TravelMode; label: string; icon: string }[] = [
  { id: 'driving', label: 'Carro', icon: 'car' },
  { id: 'walking', label: 'A pé', icon: 'walk' },
  { id: 'cycling', label: 'Bicicleta', icon: 'bike' },
];

export const APPEARANCE_MODES: { id: AppearanceMode; label: string; icon: string }[] = [
  { id: 'system', label: 'Automático', icon: 'theme-light-dark' },
  { id: 'light', label: 'Claro', icon: 'white-balance-sunny' },
  { id: 'dark', label: 'Escuro', icon: 'weather-night' },
];

const STORAGE_KEY = 'palmmap.settings';

interface SettingsContextValue {
  settings: Settings;
  theme: Theme;
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  // Lê as definições guardadas uma vez, no arranque.
  useEffect(() => {
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          // Junta-se aos valores por omissão para o caso de a aplicação ter
          // ganho definições novas desde a última vez que se guardou.
          setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
        }
      } catch {
        // Sem definições guardadas, ficam as de origem. Não é motivo para falhar.
      }
    })();
  }, []);

  const update = useCallback<SettingsContextValue['update']>((key, value) => {
    setSettings((current) => {
      const next = { ...current, [key]: value };
      // Guardar é secundário: se falhar, a definição continua a valer nesta sessão.
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);

  const value = useMemo<SettingsContextValue>(() => {
    const isDark =
      settings.appearance === 'system'
        ? systemScheme === 'dark'
        : settings.appearance === 'dark';

    return { settings, theme: themeFor(isDark), update };
  }, [settings, systemScheme, update]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

function useSettingsContext(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('Falta o SettingsProvider à volta da aplicação.');
  }
  return context;
}

/** As definições atuais e a forma de as mudar. */
export function useSettings() {
  const { settings, update } = useSettingsContext();
  return { settings, update };
}

/**
 * Quanto multiplicar o tempo que o OSRM devolve, conforme a correção escolhida.
 * Devolve 1 quando não há correção nenhuma.
 */
/** Quantos megabytes guardar, conforme a definição escolhida. */
export function cacheMegabytesFor(size: CacheSize): number {
  return CACHE_SIZES.find((option) => option.id === size)?.megabytes ?? 250;
}

export function useTimeFactor(): number {
  const { settings } = useSettingsContext();
  return (
    TIME_ADJUSTMENTS.find((option) => option.id === settings.timeAdjustment)?.factor ?? 1
  );
}

/**
 * As cores a usar agora, já a contar com a preferência guardada e com o tema
 * do telemóvel.
 */
export function useTheme(): Theme {
  return useSettingsContext().theme;
}
