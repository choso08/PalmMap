/**
 * Cores da aplicação, em versão clara e escura.
 *
 * ## A ideia: Ilha
 *
 * O nome é PalmMap e o logo é uma palmeira dentro de um pin. As cores vêm daí:
 * **areia, água funda e coral**. Em claro, o ecrã é areia quente com texto cor
 * de petróleo; em escuro, água funda com areia por cima. O destaque é coral —
 * a cor que salta na areia e no mar sem ser gritante.
 *
 * ## O que mandou nas escolhas
 *
 * Isto usa-se a conduzir e ao sol, por isso o bonito tem de caber dentro do
 * legível. Duas regras que não se devem desfazer ao mexer aqui:
 *
 * - **Texto sempre bem separado do fundo.** Nada de cinzentos claros sobre
 *   areia: o texto principal é quase preto, e o secundário ainda se lê ao sol.
 * - **Cada coisa importante tem cor própria.** O percurso é coral, o destino é
 *   água e os negócios são âmbar. A conduzir não há tempo para ler legendas.
 *
 * As cores do **mapa** estão à parte, em `src/services/vectorStyle.ts`, e
 * acompanham esta paleta. Ao mexer numa, olhar para a outra.
 *
 * Só as paletas vivem aqui. Quem decide qual delas se usa é o `SettingsProvider`
 * em `src/settings.tsx`, que junta o tema do telemóvel à preferência guardada.
 * O gancho `useTheme()` também está lá.
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
  /**
   * Autocarros em andamento, no mapa.
   *
   * Tem de se distinguir das paragens, que são a coisa parecida mais próxima:
   * uma paragem está sempre no mesmo sítio, um autocarro anda. Daí ser uma cor
   * própria e não uma das que já existem.
   */
  vehicle: string;
  /** Fundo das mensagens flutuantes por cima do mapa. */
  overlay: string;
  /** Texto dessas mensagens. */
  onOverlay: string;
  /**
   * As cores do sinal de limite de velocidade.
   *
   * São iguais nas duas paletas de propósito: é um sinal de trânsito, e o que o
   * torna legível de relance é ser sempre o mesmo. Estão aqui na mesma porque
   * nenhum componente escreve cores à mão.
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
  // Água funda. O destino tem de se distinguir do percurso, que é coral.
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
  // Um degrau acima do `surface`, senão os botões por escolher desapareciam.
  surfaceMuted: '#1E2E3C',
  text: '#EDE5D8',
  textMuted: '#95A6B0',
  placeholder: '#6C7D87',
  // Coral mais claro: o de dia perdia-se contra a água funda.
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
