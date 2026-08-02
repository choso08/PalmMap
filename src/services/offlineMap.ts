import axios from 'axios';
import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';

import { REQUEST_TIMEOUT_MS, USER_AGENT } from './config';

/**
 * Mapas de países, descarregados a pedido e guardados no telemóvel.
 *
 * A pessoa escolhe o país nas definições e o ficheiro fica lá até o apagar. A
 * partir daí esse país funciona sem rede nenhuma, a qualquer zoom e em sítios
 * onde nunca esteve — que é o que a cache do mapa não consegue dar.
 *
 * Cada país é um ficheiro só. Ao lado dele fica um pequeno ficheiro de
 * identificação com o nome e a área que cobre: é o que permite saber, sem rede,
 * se a posição atual está dentro de um mapa guardado.
 *
 * **Isto não é o mesmo que descarregar tiles do OpenStreetMap.** Cada ficheiro
 * é um recorte do mapa mundial do Protomaps, que é publicado precisamente para
 * ser usado assim.
 *
 * Os **tipos de letra** são o único que vem dentro da aplicação. São 410 KB e
 * não podiam ser de outra maneira: sem eles o mapa desenha-se mas fica sem nome
 * nenhum, e ir busca-los a um servidor estragava o offline.
 */

const BASE_URL = 'https://github.com/choso08/PalmMap/releases/download/mapas';

/** Onde ficam os mapas e os tipos de letra com que o mapa escreve. */
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
}

interface Manifest {
  regioes: OfflineRegion[];
}

/** Erro com mensagem legível, para o ecrã poder mostrar algo de útil. */
export class OfflineMapError extends Error {}

// --- Os tipos de letra ------------------------------------------------------

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

/**
 * Põe os tipos de letra no sítio onde o mapa os vai procurar.
 *
 * Dentro do APK os ficheiros não têm um caminho normal que o MapLibre consiga
 * abrir, por isso copiam-se uma vez para a pasta da aplicação. São 410 KB e só
 * acontece no primeiro arranque — depois já lá estão e a função não faz nada.
 *
 * Chamar no arranque. Falhar aqui não deve impedir a aplicação de abrir: sem
 * isto perdem-se os nomes no mapa offline, não o resto.
 */
export async function installBundledAssets(): Promise<void> {
  ensureFolder(MAPS);

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
    return response.data.regioes ?? [];
  } catch {
    // Sem rede, mostra-se pelo menos o que já está guardado. Um menu vazio
    // daria a entender que se perderam os mapas descarregados, e não se perderam.
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
export async function downloadRegion(
  region: OfflineRegion,
  onProgress?: (fracao: number) => void,
): Promise<void> {
  ensureFolder(MAPS);

  const parcial = new File(MAPS, `${region.ficheiro}.parcial`);
  if (parcial.exists) {
    parcial.delete();
  }

  try {
    const descarregado = await File.downloadFileAsync(
      `${BASE_URL}/${region.ficheiro}`,
      parcial,
      {
        onProgress: ({ bytesWritten, totalBytes }) => {
          // O servidor nem sempre diz o tamanho à partida — nesse caso vem -1 e
          // usa-se o do manifesto, que é o valor real medido ao gerar o ficheiro.
          const total = totalBytes > 0 ? totalBytes : region.bytes;
          if (total > 0) {
            onProgress?.(Math.min(1, bytesWritten / total));
          }
        },
      },
    );

    const destino = localFile(region);
    if (destino.exists) {
      destino.delete();
    }
    await descarregado.move(destino);
    writeMetadata(region);
  } catch (erro) {
    if (parcial.exists) {
      parcial.delete();
    }
    // A mensagem do sistema vai junto. Sem ela ficava-se sem saber se foi a
    // rede, o espaço em disco ou o servidor — e num ficheiro de centenas de
    // megabytes é quase sempre a rede a cair a meio.
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    throw new OfflineMapError(
      `Não foi possível descarregar o mapa de ${region.nome}. ${detalhe}`.trim(),
    );
  }
}

/** Apaga o mapa guardado de uma região. */
export function removeRegion(region: OfflineRegion): void {
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
