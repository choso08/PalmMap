import axios from 'axios';
import { t } from '../i18n';
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

/** Uma região só entra em conta se souber que área cobre. */
function temArea(r: OfflineRegion): boolean {
  return Array.isArray(r.bbox) && r.bbox.length === 4;
}

/**
 * A região guardada que serve para o que se está a ver.
 *
 * Escolhe-se em dois tempos, e o segundo existe por uma razão prática:
 *
 * 1. **A que cobre o centro do ecrã.** É o caso normal — está-se dentro do país.
 * 2. **Senão, qualquer uma que apareça no ecrã.** Ao afastar o mapa, o centro
 *    sai facilmente de um país pequeno e cai no mar. Com só a primeira regra, a
 *    aplicação largava o mapa guardado e voltava aos tiles da Internet — que em
 *    modo de avião não existem, e o ecrã ficava preto. Enquanto o país guardado
 *    estiver à vista, continua a ser ele a desenhar.
 *
 * Havendo várias à vista, ganha a mais próxima do centro do ecrã, que é a que a
 * pessoa está a olhar.
 */
export function regionForView(
  bounds: { west: number; south: number; east: number; north: number },
  regioes = installedRegions(),
): OfflineRegion | null {
  const disponiveis = regioes.filter(temArea);
  const centroLon = (bounds.west + bounds.east) / 2;
  const centroLat = (bounds.south + bounds.north) / 2;

  for (const r of disponiveis) {
    const [oeste, sul, este, norte] = r.bbox;
    if (centroLon >= oeste && centroLon <= este && centroLat >= sul && centroLat <= norte) {
      return r;
    }
  }

  let melhor: OfflineRegion | null = null;
  let maisPerto = Infinity;

  for (const r of disponiveis) {
    const [oeste, sul, este, norte] = r.bbox;
    const separados =
      este < bounds.west || oeste > bounds.east || norte < bounds.south || sul > bounds.north;
    if (separados) {
      continue;
    }

    // Distância em graus, que chega de sobra para escolher entre duas regiões.
    const dLon = (oeste + este) / 2 - centroLon;
    const dLat = (sul + norte) / 2 - centroLat;
    const distancia = dLon * dLon + dLat * dLat;
    if (distancia < maisPerto) {
      maisPerto = distancia;
      melhor = r;
    }
  }

  return melhor;
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
      t().errors.mapListFailed,
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

  /**
   * A última percentagem inteira já comunicada.
   *
   * **O sistema avisa a cada bocado que escreve no disco**, e num ficheiro de
   * centenas de megabytes isso são milhares de avisos por segundo. Cada um
   * chegava ao ecrã e redesenhava a lista inteira — a barra andava na mesma, mas
   * o telemóvel passava o tempo a desenhar em vez de a descarregar, e com várias
   * descargas ao mesmo tempo era o suficiente para a aplicação deixar de
   * responder. Só se avisa quando o número que se vê muda mesmo.
   */
  let ultimaPercentagem = -1;

  try {
    const descarregado = await File.downloadFileAsync(
      `${BASE_URL}/${region.ficheiro}`,
      parcial,
      {
        onProgress: ({ bytesWritten, totalBytes }) => {
          // O servidor nem sempre diz o tamanho à partida — nesse caso vem -1 e
          // usa-se o do manifesto, que é o valor real medido ao gerar o ficheiro.
          const total = totalBytes > 0 ? totalBytes : region.bytes;
          if (total <= 0) {
            return;
          }

          const fracao = Math.min(1, bytesWritten / total);
          const percentagem = Math.floor(fracao * 100);
          if (percentagem === ultimaPercentagem) {
            return;
          }
          ultimaPercentagem = percentagem;
          onProgress?.(fracao);
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
      t().errors.mapDownloadFailed(region.nome, detalhe),
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
    throw new OfflineMapError(t().errors.bundledAssetFailed);
  }
  await new File(asset.localUri).copy(destino);
}
