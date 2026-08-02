import axios from 'axios';
import { Directory, File, Paths } from 'expo-file-system';

import { REQUEST_TIMEOUT_MS, USER_AGENT } from './config';

/**
 * Mapas de países inteiros, guardados no telemóvel.
 *
 * Os ficheiros são gerados pelo workflow "Gerar mapa offline" e publicados
 * sempre na mesma Release, com a etiqueta `mapas`. Assim o endereço é fixo e
 * não é preciso andar à procura da versão mais recente.
 *
 * **Isto não é o mesmo que descarregar tiles do OpenStreetMap.** Cada ficheiro
 * é um recorte do mapa mundial do Protomaps, que é publicado precisamente para
 * ser usado assim. São dois ou três ficheiros, não milhares de imagens.
 */

const BASE_URL = 'https://github.com/choso08/PalmMap/releases/download/mapas';

/** Onde ficam os mapas descarregados. */
const FOLDER = new Directory(Paths.document, 'mapas');

/** Uma região disponível para descarregar, tal como vem do manifesto. */
export interface OfflineRegion {
  id: string;
  nome: string;
  ficheiro: string;
  bytes: number;
  maxzoom: number;
}

interface Manifest {
  regioes: OfflineRegion[];
}

/** Erro com mensagem legível, para o ecrã poder mostrar algo de útil. */
export class OfflineMapError extends Error {}

function ensureFolder(): void {
  if (!FOLDER.exists) {
    FOLDER.create({ intermediates: true });
  }
}

/** O ficheiro local de uma região, exista ele ou não. */
export function localFile(region: OfflineRegion): File {
  return new File(FOLDER, region.ficheiro);
}

/** Se a região já está descarregada. */
export function isDownloaded(region: OfflineRegion): boolean {
  return localFile(region).exists;
}

/**
 * O endereço que o MapLibre usa para ler o mapa guardado.
 *
 * O prefixo `pmtiles://` diz ao MapLibre que o ficheiro está no formato
 * PMTiles, em vez de ser um servidor de tiles normal.
 */
export function localStyleSource(region: OfflineRegion): string {
  return `pmtiles://${localFile(region).uri}`;
}

/** Vai buscar a lista de mapas disponíveis e os tamanhos de cada um. */
export async function listRegions(): Promise<OfflineRegion[]> {
  try {
    const response = await axios.get<Manifest>(`${BASE_URL}/mapas.json`, {
      timeout: REQUEST_TIMEOUT_MS,
      headers: { 'User-Agent': USER_AGENT },
    });
    return response.data.regioes ?? [];
  } catch {
    throw new OfflineMapError(
      'Não foi possível obter a lista de mapas. Verifique a ligação à Internet.',
    );
  }
}

/**
 * Descarrega o mapa de uma região.
 *
 * Descarrega para um nome temporário e só no fim lhe dá o nome definitivo: se a
 * ligação cair a meio, não fica um ficheiro incompleto a fazer-se passar por
 * bom.
 */
export async function downloadRegion(region: OfflineRegion): Promise<void> {
  ensureFolder();

  const parcial = new File(FOLDER, `${region.ficheiro}.parcial`);
  if (parcial.exists) {
    parcial.delete();
  }

  try {
    const descarregado = await File.downloadFileAsync(
      `${BASE_URL}/${region.ficheiro}`,
      parcial,
    );

    const destino = localFile(region);
    if (destino.exists) {
      destino.delete();
    }
    descarregado.move(destino);
  } catch {
    if (parcial.exists) {
      parcial.delete();
    }
    throw new OfflineMapError(`Não foi possível descarregar o mapa de ${region.nome}.`);
  }
}

/** Apaga o mapa guardado de uma região. */
export function removeRegion(region: OfflineRegion): void {
  const ficheiro = localFile(region);
  if (ficheiro.exists) {
    ficheiro.delete();
  }
}

/** Quanto ocupam, ao todo, os mapas já guardados. */
export function usedBytes(): number {
  if (!FOLDER.exists) {
    return 0;
  }

  return FOLDER.list().reduce((total, entrada) => {
    return entrada instanceof File ? total + (entrada.size ?? 0) : total;
  }, 0);
}
