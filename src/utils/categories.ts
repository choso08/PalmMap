/**
 * Categorias de negócios e locais.
 *
 * Dois papéis:
 * - `SEARCH_CATEGORIES` são os botões de pesquisa rápida ("Restaurantes", …)
 *   e sabem como se perguntam à Overpass.
 * - `categoryLabel()` traduz as etiquetas do OpenStreetMap para texto legível,
 *   e serve tanto para a Overpass como para o Nominatim.
 */

export interface SearchCategory {
  id: string;
  label: string;
  /** Nome do ícone, da família MaterialCommunityIcons. */
  icon: string;
  /** Etiquetas do OpenStreetMap que correspondem a esta categoria. */
  tags: { key: string; values: string[] }[];
}

export const SEARCH_CATEGORIES: SearchCategory[] = [
  {
    id: 'food',
    label: 'Restaurantes',
    icon: 'silverware-fork-knife',
    tags: [{ key: 'amenity', values: ['restaurant', 'fast_food'] }],
  },
  {
    id: 'cafe',
    label: 'Cafés',
    icon: 'coffee',
    tags: [{ key: 'amenity', values: ['cafe', 'bar', 'pub'] }],
  },
  {
    id: 'pharmacy',
    label: 'Farmácias',
    icon: 'pill',
    tags: [{ key: 'amenity', values: ['pharmacy'] }],
  },
  {
    id: 'fuel',
    label: 'Combustível',
    icon: 'gas-station',
    tags: [{ key: 'amenity', values: ['fuel', 'charging_station'] }],
  },
  {
    id: 'shopping',
    label: 'Supermercados',
    icon: 'cart',
    tags: [{ key: 'shop', values: ['supermarket', 'convenience'] }],
  },
  {
    id: 'money',
    label: 'Multibanco',
    icon: 'cash',
    tags: [{ key: 'amenity', values: ['atm', 'bank'] }],
  },
  {
    id: 'parking',
    label: 'Estacionamento',
    icon: 'parking',
    tags: [{ key: 'amenity', values: ['parking'] }],
  },
  {
    id: 'health',
    label: 'Saúde',
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

/** Nome legível para cada valor de etiqueta do OpenStreetMap. */
const LABELS: Record<string, string> = {
  restaurant: 'Restaurante',
  fast_food: 'Comida rápida',
  cafe: 'Café',
  bar: 'Bar',
  pub: 'Cervejaria',
  pharmacy: 'Farmácia',
  fuel: 'Posto de combustível',
  charging_station: 'Carregamento elétrico',
  bank: 'Banco',
  atm: 'Multibanco',
  hospital: 'Hospital',
  clinic: 'Clínica',
  doctors: 'Consultório',
  dentist: 'Dentista',
  parking: 'Estacionamento',
  post_office: 'Correios',
  supermarket: 'Supermercado',
  convenience: 'Mercearia',
  bakery: 'Padaria',
  butcher: 'Talho',
  clothes: 'Roupa',
  hairdresser: 'Cabeleireiro',
  car_repair: 'Oficina',
  hotel: 'Hotel',
  hostel: 'Hostel',
  guest_house: 'Alojamento',
  museum: 'Museu',
  attraction: 'Ponto de interesse',
  school: 'Escola',
  university: 'Universidade',
};

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
    if (LABELS[value]) {
      return LABELS[value];
    }
    // Sem tradução conhecida: usa-se o próprio valor, com o underscore trocado
    // por espaço, que é melhor do que não mostrar nada.
    return value.replace(/_/g, ' ');
  }

  return undefined;
}
