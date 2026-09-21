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
 * Definições da aplicação: guardadas no telemóvel e disponíveis a toda a
 * aplicação através do contexto.
 */

/** Aspeto do mapa e da interface. */
export type AppearanceMode = 'system' | 'light' | 'dark';

/**
 * Meio de transporte usado para calcular o percurso.
 *
 * Os três primeiros são perfis do OSRM. O `transit` **não é**: os transportes
 * não se calculam com um motor de percursos, montam-se a partir das horas de
 * passagem das paragens — ver `src/services/transit.ts`.
 */
export type TravelMode = 'driving' | 'walking' | 'cycling' | 'transit';

/** Só os três que o OSRM sabe calcular. `null` para os transportes. */
export function osrmProfile(mode: TravelMode): 'driving' | 'walking' | 'cycling' | null {
  return mode === 'transit' ? null : mode;
}

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

/** Mapa desenhado, imagem de satélite ou rede de transportes públicos. */
export type MapType = 'map' | 'satellite' | 'transit';

/**
 * Quanto detalhe se pede à imagem de satélite.
 *
 * `normal` é o Sentinel-2, que cobre o mundo mas vê a 10 metros por pixel.
 * `alta` acrescenta-lhe por cima as ortofotos oficiais, que vêem a menos de um
 * metro — mas só existem para Portugal, e gastam muito mais dados.
 */
export type SatelliteDetail = 'normal' | 'alta';

export interface Settings {
  /** Língua da aplicação. Em `auto` segue a do telemóvel. */
  language: LanguagePreference;
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
  /** Avisar de radares e controlos de velocidade durante a navegação. */
  speedCameraAlerts: boolean;
  /** Pedir ao OSRM um percurso que evite estradas com portagem. */
  avoidTolls: boolean;
  /** Ler o GPS menos vezes quando a manobra seguinte ainda vai longe. */
  batterySaver: boolean;
  /**
   * Mostrar a velocidade a que se vai, durante a navegação.
   *
   * Não custa bateria nenhuma: a velocidade vem dentro das leituras de GPS que a
   * navegação já faz de qualquer maneira.
   */
  showSpeed: boolean;
  /**
   * Mostrar os autocarros a andar, no tipo de mapa dos transportes.
   *
   * Fica ligado de origem porque é a razão de se ir ao mapa dos transportes,
   * mas é o pedido mais pesado da aplicação — ver `VEHICLES_MIN_ZOOM`.
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
  avoidTolls: false,
  batterySaver: true,
  showSpeed: true,
  showVehicles: true,
};

/**
 * Os tipos de mapa, pela ordem por que o botão os percorre.
 *
 * O botão mostra sempre o ícone do **seguinte**, não o do atual: é o que se vai
 * buscar ao carregar.
 */
export const MAP_TYPES: { id: MapType; icon: string }[] = [
  { id: 'map', icon: 'map-outline' },
  { id: 'satellite', icon: 'satellite-variant' },
  { id: 'transit', icon: 'bus' },
];

/** O tipo de mapa a seguir a este, para o botão do canto. */
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
 * A que ritmo a pessoa anda mesmo, por meio de transporte.
 *
 * Um fator: 1,3 quer dizer "leva um terço mais tempo do que o serviço de
 * percursos diz". Mede-se durante a navegação e fica guardado, para a estimativa
 * seguinte já nascer certa — a que interessa é a que se lê **antes** de partir.
 *
 * **Não é uma definição, e por isso não está no tipo `Settings`:** ninguém a
 * escolhe, a aplicação é que a aprende. Vive aqui e não num serviço próprio
 * porque é exatamente o mesmo ciclo de vida do resto do que este ficheiro guarda.
 */
export type LearnedPace = Partial<Record<TravelMode, number>>;

const PACE_KEY = 'palmmap.pace';

interface SettingsContextValue {
  settings: Settings;
  /** O ritmo aprendido, por meio de transporte. Vazio enquanto não se mediu nada. */
  pace: LearnedPace;
  /** Junta o ritmo de uma viagem ao que já estava guardado. */
  learnPace: (mode: TravelMode, measured: number) => void;
  /** Esquece tudo o que foi aprendido. */
  forgetPace: () => void;
  theme: Theme;
  /** A língua a usar mesmo, já com o "automático" resolvido. */
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

  // Lê as definições guardadas uma vez, no arranque.
  useEffect(() => {
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          setSettings({
            // Junta-se aos valores por omissão para o caso de a aplicação ter
            // ganho definições novas desde a última vez que se guardou.
            ...DEFAULT_SETTINGS,
            ...JSON.parse(stored),
            // O tipo de mapa é a única definição que **não** se lembra, e é de
            // propósito: é uma escolha do momento, não uma preferência para a
            // vida. Vê-se o satélite para espreitar um terreno e os transportes
            // para saber por onde passa o autocarro — e depois quer-se o mapa
            // outra vez. Guardá-lo fazia a aplicação abrir dias mais tarde nos
            // Transportes, com os autocarros a pedir dados de vinte em vinte
            // segundos, só porque foi ali que se fechou da última vez.
            mapType: DEFAULT_SETTINGS.mapType,
          });
        }
      } catch {
        // Sem definições guardadas, ficam as de origem. Não é motivo para falhar.
      }

      try {
        const stored = await AsyncStorage.getItem(PACE_KEY);
        if (stored) {
          setPace(JSON.parse(stored));
        }
      } catch {
        // Sem ritmo guardado, a estimativa é a do serviço até se medir um.
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

  /**
   * Guarda o ritmo de uma viagem que acabou de terminar.
   *
   * Guardar é secundário, como nas definições: se falhar, o valor continua a
   * valer nesta sessão.
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

    // Os serviços não podem usar hooks e leem a língua de uma variável do
    // módulo. É aqui que ela se põe — no mesmo sítio onde a preferência é
    // resolvida, para não haver duas fontes da mesma verdade.
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
    throw new Error('Falta o SettingsProvider à volta da aplicação.');
  }
  return context;
}

/** As definições atuais e a forma de as mudar. */
export function useSettings() {
  const { settings, update } = useSettingsContext();
  return { settings, update };
}

/** Quantos megabytes guardar, conforme a definição escolhida. */
export function cacheMegabytesFor(size: CacheSize): number {
  return CACHE_SIZES.find((option) => option.id === size)?.megabytes ?? 250;
}

/**
 * O tempo que se mostra, a partir do que o serviço de percursos respondeu.
 *
 * Recebe a distância **e** a duração porque o modelo de bicicleta precisa das
 * duas — ver `modelSeconds`. O terceiro argumento é o ritmo medido nesta viagem,
 * que só o ecrã de navegação tem; os outros ecrãs deixam-no de fora e ficam com
 * o que foi aprendido das viagens anteriores.
 *
 * A ordem é sempre a mesma: **o desta viagem ganha ao aprendido, e o aprendido
 * ganha à correção manual.** O medido ganha ao adivinhado, e nunca se
 * multiplicam — ver a nota no cabeçalho de `utils/eta.ts`.
 */
export function useEta(): (
  distanceMeters: number,
  osrmSeconds: number,
  livePace?: number | null,
) => number {
  const { settings, pace } = useSettingsContext();
  const mode = settings.travelMode;
  const manual =
    TIME_ADJUSTMENTS.find((option) => option.id === settings.timeAdjustment)?.factor ?? 1;
  const learned = pace[mode];

  return useCallback(
    (distanceMeters, osrmSeconds, livePace) =>
      modelSeconds(distanceMeters, osrmSeconds, mode) * (livePace ?? learned ?? manual),
    [mode, learned, manual],
  );
}

/** O ritmo aprendido e a forma de o esquecer, para o ecrã de definições. */
export function useLearnedPace() {
  const { pace, learnPace, forgetPace } = useSettingsContext();
  return { pace, learnPace, forgetPace };
}

/**
 * As cores a usar agora, já a contar com a preferência guardada e com o tema
 * do telemóvel.
 */
export function useTheme(): Theme {
  return useSettingsContext().theme;
}

/**
 * Os textos na língua atual.
 *
 * É um hook de propósito: assim um componente redesenha-se quando a língua muda,
 * sem ser preciso reiniciar a aplicação. Quem não pode usar hooks — os serviços —
 * tem o `t()` do `src/i18n`.
 */
export function useT(): Strings {
  return useSettingsContext().strings;
}

/** A língua a usar mesmo, para quem precisa do código e não do texto. */
export function useLanguage(): Language {
  return useSettingsContext().language;
}
