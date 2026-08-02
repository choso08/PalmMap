import axios from 'axios';
import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';

import { REQUEST_TIMEOUT_MS, USER_AGENT } from './config';

/**
 * Mapas de países guardados no telemóvel.
 *
 * Há dois caminhos para um mapa chegar aqui, e depois de chegar são tratados
 * exatamente da mesma maneira:
 *
 * 1. **Vem dentro da aplicação.** São Tomé e Príncipe ocupa 2 MB, por isso
 *    viaja dentro do próprio APK. Está lá desde o primeiro arranque, sem
 *    descarregar nada e sem precisar de rede alguma vez.
 * 2. **Descarrega-se.** Os outros países são grandes de mais para irem dentro
 *    da aplicação (só Portugal continental são 325 MB) e vão buscar-se a uma
 *    Release quando a pessoa os pedir.
 *
 * Os dois acabam na mesma pasta, com um ficheiro de identificação ao lado. A
 * partir daí o resto do código não sabe nem precisa de saber de onde vieram.
 *
 * **Isto não é o mesmo que descarregar tiles do OpenStreetMap.** Cada ficheiro
 * é um recorte do mapa mundial do Protomaps, que é publicado precisamente para
 * ser usado assim.
 */

const BASE_URL = 'https://github.com/choso08/PalmMap/releases/download/mapas';

/** Onde ficam os mapas e os tipos de letra que o mapa usa para escrever. */
const MAPS = new Directory(Paths.document, 'mapas');
const GLYPHS = new Directory(Paths.document, 'glifos');

/** Uma região disponível, tal como vem do manifesto ou de dentro da aplicação. */
export interface OfflineRegion {
  id: string;
  nome: string;
  ficheiro: string;
  bytes: number;
  maxzoom: number;
  /** Área abrangida: oeste, sul, este, norte. */
  bbox: [number, number, number, number];
  /** Verdadeiro se vem dentro da aplicação, em vez de se descarregar. */
  incluido?: boolean;
}

interface Manifest {
  regioes: OfflineRegion[];
}

/** Erro com mensagem legível, para o ecrã poder mostrar algo de útil. */
export class OfflineMapError extends Error {}

// --- O que vem dentro da aplicação -------------------------------------------

/**
 * São Tomé e Príncipe, incluído no APK.
 *
 * Os valores estão aqui à mão de propósito: como o ficheiro viaja connosco, não
 * há manifesto nenhum para consultar, e ao arrancar sem rede é preciso saber
 * isto na mesma. Se o ficheiro em `assets/mapas/` for substituído, atualizar
 * também o `bytes`.
 */
const BUNDLED: OfflineRegion = {
  id: 'saotome',
  nome: 'São Tomé e Príncipe',
  ficheiro: 'saotome.pmtiles',
  bytes: 2057948,
  maxzoom: 14,
  bbox: [6.35, -0.1, 7.55, 1.8],
  incluido: true,
};

/**
 * Os tipos de letra com que o mapa escreve os nomes.
 *
 * Cada ficheiro cobre 256 caracteres. Os dois primeiros blocos chegam para o
 * português: o primeiro tem o alfabeto e os acentos mais comuns, o segundo o
 * resto dos caracteres latinos. Os nomes das pastas **têm de ser exatamente**
 * os que o estilo pede em `text-font`.
 */
const FONTS = [
  { stack: 'Noto Sans Regular', range: '0-255', asset: require('../../assets/glifos/Noto_Sans_Regular_0-255.pbf') },
  { stack: 'Noto Sans Regular', range: '256-511', asset: require('../../assets/glifos/Noto_Sans_Regular_256-511.pbf') },
  { stack: 'Noto Sans Medium', range: '0-255', asset: require('../../assets/glifos/Noto_Sans_Medium_0-255.pbf') },
  { stack: 'Noto Sans Medium', range: '256-511', asset: require('../../assets/glifos/Noto_Sans_Medium_256-511.pbf') },
];

const BUNDLED_MAP = require('../../assets/mapas/saotome.pmtiles');

/**
 * Põe o mapa incluído e os tipos de letra no sítio onde o mapa os vai procurar.
 *
 * Dentro do APK os ficheiros não têm um caminho normal que o MapLibre consiga
 * abrir, por isso copiam-se uma vez para a pasta da aplicação. São 2,4 MB e só
 * acontece no primeiro arranque — depois já lá estão e a função não faz nada.
 *
 * Chamar no arranque, antes de desenhar o mapa. Falhar aqui não deve impedir a
 * aplicação de abrir: sem isto perde-se o mapa offline, não o resto.
 */
export async function installBundledAssets(): Promise<void> {
  ensureFolder(MAPS);

  const destino = new File(MAPS, BUNDLED.ficheiro);
  if (!destino.exists) {
    await copyAsset(BUNDLED_MAP, destino);
  }
  // Escreve-se sempre: é barato e apanha o caso de uma versão nova da aplicação
  // trazer um mapa com outra área ou outro tamanho.
  writeMetadata(BUNDLED);

  for (const font of FONTS) {
    const pasta = new Directory(GLYPHS, font.stack);
    ensureFolder(pasta);

    const ficheiro = new File(pasta, `${font.range}.pbf`);
    if (!ficheiro.exists) {
      await copyAsset(font.asset, ficheiro);
    }
  }
}

/**
 * O endereço dos tipos de letra, no formato que o estilo do mapa espera.
 *
 * O MapLibre substitui `{fontstack}` e `{range}` sozinho, conforme os
 * caracteres de que precisa.
 */
export function glyphsTemplate(): string {
  return `${withSlash(GLYPHS.uri)}{fontstack}/{range}.pbf`;
}

// --- Os mapas guardados ------------------------------------------------------

/** O ficheiro local de uma região, exista ele ou não. */
export function localFile(region: OfflineRegion): File {
  return new File(MAPS, region.ficheiro);
}

/** Se a região já está no telemóvel. */
export function isDownloaded(region: OfflineRegion): boolean {
  return localFile(region).exists;
}

/**
 * O endereço que o MapLibre usa para ler o mapa guardado.
 *
 * O prefixo `pmtiles://` diz-lhe que o ficheiro é um mapa inteiro num só
 * ficheiro, em vez de um servidor de tiles.
 *
 * Se um dia isto não funcionar, a outra forma de escrever o mesmo é
 * `pmtiles:///caminho/absoluto`, sem o `file://` pelo meio — há bibliotecas que
 * só aceitam uma das duas.
 */
export function localStyleSource(region: OfflineRegion): string {
  return `pmtiles://${localFile(region).uri}`;
}

/**
 * As regiões que estão mesmo no telemóvel neste momento.
 *
 * Lê a pasta em vez de perguntar à Internet, para funcionar sem rede — que é o
 * ponto de tudo isto.
 */
export function installedRegions(): OfflineRegion[] {
  if (!MAPS.exists) {
    return [];
  }

  const regioes: OfflineRegion[] = [];
  for (const entrada of MAPS.list()) {
    if (!(entrada instanceof File) || !entrada.uri.endsWith('.json')) {
      continue;
    }
    try {
      const regiao = JSON.parse(entrada.textSync()) as OfflineRegion;
      if (new File(MAPS, regiao.ficheiro).exists) {
        regioes.push(regiao);
      }
    } catch {
      // Ficheiro de identificação estragado: ignora-se essa região em vez de
      // deixar a aplicação sem mapa nenhum.
    }
  }
  return regioes;
}

/**
 * A região guardada que cobre uma posição, se houver alguma.
 *
 * É isto que faz o mapa passar a offline sozinho quando se entra num país
 * descarregado, sem a pessoa ter de escolher nada.
 */
export function regionAt(
  longitude: number,
  latitude: number,
  regioes = installedRegions(),
): OfflineRegion | null {
  for (const r of regioes) {
    // Um manifesto antigo pode não trazer a área. Nesse caso salta-se a região
    // em vez de rebentar — perde-se o offline dessa, não o mapa todo.
    if (!Array.isArray(r.bbox) || r.bbox.length !== 4) {
      continue;
    }
    const [oeste, sul, este, norte] = r.bbox;
    if (longitude >= oeste && longitude <= este && latitude >= sul && latitude <= norte) {
      return r;
    }
  }
  return null;
}

/** Vai buscar a lista de mapas disponíveis para descarregar. */
export async function listRegions(): Promise<OfflineRegion[]> {
  try {
    const response = await axios.get<Manifest>(`${BASE_URL}/mapas.json`, {
      timeout: REQUEST_TIMEOUT_MS,
      headers: { 'User-Agent': USER_AGENT },
    });
    const remotas = (response.data.regioes ?? []).filter((r) => r.id !== BUNDLED.id);
    return [BUNDLED, ...remotas];
  } catch {
    // Sem rede, mostra-se pelo menos o que já está no telemóvel. Um menu vazio
    // daria a entender que se perdeu o mapa incluído, e não se perdeu.
    const guardadas = installedRegions();
    if (guardadas.length > 0) {
      return guardadas;
    }
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
  if (region.incluido) {
    return;
  }
  ensureFolder(MAPS);

  const parcial = new File(MAPS, `${region.ficheiro}.parcial`);
  if (parcial.exists) {
    parcial.delete();
  }

  try {
    const descarregado = await File.downloadFileAsync(`${BASE_URL}/${region.ficheiro}`, parcial);

    const destino = localFile(region);
    if (destino.exists) {
      destino.delete();
    }
    await descarregado.move(destino);
    writeMetadata(region);
  } catch {
    if (parcial.exists) {
      parcial.delete();
    }
    throw new OfflineMapError(`Não foi possível descarregar o mapa de ${region.nome}.`);
  }
}

/** Apaga o mapa guardado de uma região. O incluído na aplicação não se apaga. */
export function removeRegion(region: OfflineRegion): void {
  if (region.incluido) {
    return;
  }

  const ficheiro = localFile(region);
  if (ficheiro.exists) {
    ficheiro.delete();
  }

  const identificacao = metadataFile(region);
  if (identificacao.exists) {
    identificacao.delete();
  }
}

/** Quanto ocupam, ao todo, os mapas guardados. */
export function usedBytes(): number {
  if (!MAPS.exists) {
    return 0;
  }

  return MAPS.list().reduce((total, entrada) => {
    return entrada instanceof File ? total + (entrada.size ?? 0) : total;
  }, 0);
}

// --- Ajudas ------------------------------------------------------------------

function ensureFolder(pasta: Directory): void {
  if (!pasta.exists) {
    pasta.create({ intermediates: true });
  }
}

function withSlash(uri: string): string {
  return uri.endsWith('/') ? uri : `${uri}/`;
}

function metadataFile(region: OfflineRegion): File {
  return new File(MAPS, `${region.id}.json`);
}

function writeMetadata(region: OfflineRegion): void {
  metadataFile(region).write(JSON.stringify(region));
}

/** Copia um ficheiro que veio dentro da aplicação para um sítio utilizável. */
async function copyAsset(module: number, destino: File): Promise<void> {
  const [asset] = await Asset.loadAsync(module);
  if (!asset?.localUri) {
    throw new OfflineMapError('Não foi possível ler um ficheiro incluído na aplicação.');
  }
  await new File(asset.localUri).copy(destino);
}
