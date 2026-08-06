/**
 * Tipos da resposta da Overpass API (consulta de locais do OpenStreetMap).
 *
 * A Overpass é o que permite perguntar "que restaurantes há aqui à volta?",
 * coisa que o Nominatim não faz bem.
 *
 * Documentação: https://wiki.openstreetmap.org/wiki/Overpass_API
 */

/**
 * Um elemento devolvido pela Overpass.
 *
 * Os `node` (pontos) trazem `lat`/`lon` diretamente. Os `way` e `relation`
 * (linhas e áreas, como o edifício de um supermercado) só trazem o centro,
 * em `center`, e só porque a consulta pede `out center`.
 */
export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface OverpassResponse {
  /**
   * Explicação quando a consulta não correu bem.
   *
   * A Overpass responde **200** mesmo quando rebenta pelo tempo ou pela
   * memória, e mete a razão aqui. Sem olhar para isto, uma falha passava por
   * "não há nada nesta zona".
   */
  remark?: string;
  elements: OverpassElement[];
}
