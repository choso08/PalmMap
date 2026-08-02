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

export interface Settings {
  appearance: AppearanceMode;
  travelMode: TravelMode;
  /** Mostrar negócios sozinhos no mapa, à medida que se navega. */
  showPlacesOnMap: boolean;
  /** Ler as instruções em voz alta durante a navegação. */
  voiceGuidance: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  appearance: 'system',
  travelMode: 'driving',
  showPlacesOnMap: true,
  voiceGuidance: true,
};

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
 * As cores a usar agora, já a contar com a preferência guardada e com o tema
 * do telemóvel.
 */
export function useTheme(): Theme {
  return useSettingsContext().theme;
}
