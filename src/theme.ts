import { useColorScheme } from 'react-native';

/**
 * Cores da aplicação, em versão clara e escura.
 *
 * A aplicação segue o que estiver definido no telemóvel: se o sistema estiver
 * em modo escuro, a aplicação fica escura sozinha. Para isso funcionar, o
 * `app.json` tem de ter `userInterfaceStyle` a "automatic".
 */
export interface Theme {
  dark: boolean;
  /** Fundo do ecrã, por baixo do mapa. */
  background: string;
  /** Fundo dos painéis e da barra de pesquisa. */
  surface: string;
  /** Fundo dos botões de categoria por escolher. */
  surfaceMuted: string;
  /** Texto principal. */
  text: string;
  /** Texto secundário: moradas, legendas. */
  textMuted: string;
  /** Texto de sugestão dentro da caixa de pesquisa. */
  placeholder: string;
  /** Cor de destaque: botões, percurso, ligações. */
  accent: string;
  /** Texto por cima da cor de destaque. */
  onAccent: string;
  /** Linhas separadoras. */
  border: string;
  /** Mensagens de erro. */
  danger: string;
  /** Marcador do destino. */
  destination: string;
  /** Pinos dos negócios. */
  poi: string;
  /** Contorno dos pinos, para se destacarem do mapa. */
  poiOutline: string;
  /** Fundo das mensagens flutuantes por cima do mapa. */
  overlay: string;
  /** Texto dessas mensagens. */
  onOverlay: string;
}

const light: Theme = {
  dark: false,
  background: '#e5e7eb',
  surface: '#ffffff',
  surfaceMuted: '#ffffff',
  text: '#111827',
  textMuted: '#6b7280',
  placeholder: '#9ca3af',
  accent: '#1d4ed8',
  onAccent: '#ffffff',
  border: '#e5e7eb',
  danger: '#b91c1c',
  destination: '#dc2626',
  poi: '#f59e0b',
  poiOutline: '#ffffff',
  overlay: 'rgba(17, 24, 39, 0.75)',
  onOverlay: '#ffffff',
};

const dark: Theme = {
  dark: true,
  background: '#0b0f17',
  surface: '#161b26',
  surfaceMuted: '#232936',
  text: '#f3f4f6',
  textMuted: '#9ca3af',
  placeholder: '#6b7280',
  accent: '#60a5fa',
  onAccent: '#0b0f17',
  border: '#2a3140',
  danger: '#f87171',
  destination: '#f87171',
  poi: '#fbbf24',
  poiOutline: '#161b26',
  overlay: 'rgba(0, 0, 0, 0.8)',
  onOverlay: '#f3f4f6',
};

/**
 * Devolve as cores certas para o tema atual do telemóvel.
 * Muda sozinho quando a pessoa troca de modo claro para escuro.
 */
export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
