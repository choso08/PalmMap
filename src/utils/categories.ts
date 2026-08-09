import { t } from '../i18n';

/**
 * Categorias de negócios e locais.
 *
 * Dois papéis:
 * - `SEARCH_CATEGORIES` são os botões de pesquisa rápida ("Restaurantes", …)
 *   e sabem como se perguntam à Overpass.
 * - `categoryLabel()` traduz as etiquetas do OpenStreetMap para texto legível,
 *   e serve tanto para a Overpass como para o Nominatim.
 *
 * **Os nomes não estão aqui.** Estão nas tabelas de cada língua, e estas
 * estruturas só guardam a chave — senão trocar de língua obrigava a mexer nesta
 * lista, que é sobre outra coisa: sobre o que se pergunta ao OpenStreetMap.
 */

export interface SearchCategory {
  id: string;
  /** A chave do nome na tabela da língua. Ver `categoryTitle()`. */
  labelKey: keyof ReturnType<typeof t>['categories'];
  /** Nome do ícone, da família MaterialCommunityIcons. */
  icon: string;
  /** Etiquetas do OpenStreetMap que correspondem a esta categoria. */
  tags: { key: string; values: string[] }[];
}

export const SEARCH_CATEGORIES: SearchCategory[] = [
  {
    id: 'food',
    labelKey: 'restaurants',
    icon: 'silverware-fork-knife',
    tags: [{ key: 'amenity', values: ['restaurant', 'fast_food'] }],
  },
  {
    id: 'cafe',
    labelKey: 'cafes',
    icon: 'coffee',
    tags: [{ key: 'amenity', values: ['cafe', 'bar', 'pub'] }],
  },
  {
    id: 'pharmacy',
    labelKey: 'pharmacies',
    icon: 'pill',
    tags: [{ key: 'amenity', values: ['pharmacy'] }],
  },
  {
    id: 'fuel',
    labelKey: 'fuel',
    icon: 'gas-station',
    tags: [{ key: 'amenity', values: ['fuel', 'charging_station'] }],
  },
  {
    id: 'shopping',
    labelKey: 'supermarkets',
    icon: 'cart',
    tags: [{ key: 'shop', values: ['supermarket', 'convenience'] }],
  },
  {
    id: 'money',
    labelKey: 'atm',
    icon: 'cash',
    tags: [{ key: 'amenity', values: ['atm', 'bank'] }],
  },
  {
    id: 'parking',
    labelKey: 'parking',
    icon: 'parking',
    tags: [{ key: 'amenity', values: ['parking'] }],
  },
  {
    id: 'health',
    labelKey: 'health',
    icon: 'hospital-box',
    tags: [{ key: 'amenity', values: ['hospital', 'clinic', 'doctors', 'dentist'] }],
  },
];

/**
 * Etiquetas que interessam quando se mostram negócios automaticamente no mapa.
 * Propositadamente limitado: mostrar tudo o que o OpenStreetMap tem enche o
 * ecrã e obriga a pedidos muito maiores.
 */
export const MAP_PIN_TAGS: { key: string; values: string[] | null }[] = [
  {
    key: 'amenity',
    values: [
      'restaurant',
      'fast_food',
      'cafe',
      'bar',
      'pub',
      'pharmacy',
      'fuel',
      'charging_station',
      'bank',
      'atm',
      'hospital',
      'clinic',
      'parking',
      'post_office',
    ],
  },
  // `null` quer dizer "qualquer valor" — qualquer loja conta.
  { key: 'shop', values: null },
  { key: 'tourism', values: ['hotel', 'hostel', 'guest_house', 'museum'] },
];

/**
 * Devolve o tipo de local em texto legível, a partir das etiquetas do
 * OpenStreetMap. Devolve `undefined` quando não se reconhece nada de útil.
 */
export function categoryLabel(tags: Record<string, string> | undefined): string | undefined {
  if (!tags) {
    return undefined;
  }

  for (const key of ['amenity', 'shop', 'tourism', 'leisure', 'office']) {
    const value = tags[key];
    if (!value) {
      continue;
    }
    const conhecido = (t().placeKinds as Record<string, string>)[value];
    if (conhecido) {
      return conhecido;
    }
    // Sem tradução conhecida: usa-se o próprio valor, com o underscore trocado
    // por espaço, que é melhor do que não mostrar nada.
    return value.replace(/_/g, ' ');
  }

  return undefined;
}

/** O nome de uma categoria, na língua atual. */
export function categoryTitle(category: SearchCategory): string {
  return t().categories[category.labelKey];
}
