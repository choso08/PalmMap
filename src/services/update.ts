import * as Application from 'expo-application';
import { Directory, File, Paths } from 'expo-file-system';
import { getContentUriAsync } from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import axios from 'axios';

import { t } from '../i18n';
import { RELEASES_API_URL, REQUEST_TIMEOUT_MS, USER_AGENT } from './config';

/**
 * Versões novas, sem ter de ir ao GitHub à mão.
 *
 * A aplicação pergunta ao GitHub se há versão nova, descarrega o APK e entrega-o
 * ao instalador do Android. **Sem chave nenhuma**: o repositório é público, e a
 * API de Releases responde a quem pergunte — é a mesma decisão que permite os
 * mapas dos países virem de um endereço sem autenticação.
 *
 * ## O que isto não é, e é importante dizê-lo
 *
 * **Não instala sozinho.** O Android não deixa — instalar em silêncio exige ser
 * a aplicação dona do aparelho, coisa de telemóveis de empresa. O que se faz é
 * tudo o que dá para fazer: procurar, descarregar e abrir o instalador já com o
 * ficheiro na mão. Quem carrega em "Instalar" é a pessoa.
 *
 * Na primeira vez o Android pergunta ainda se autoriza instalações vindas do
 * PalmMap. É uma autorização por aplicação, dada uma vez, e sem ela o instalador
 * fecha-se sem dizer porquê — daí a mensagem que o painel mostra.
 *
 * ## Porque é que se compara o número da compilação e não o texto da versão
 *
 * A versão sai do número da execução do workflow (`7.0.16` é a décima sexta), e
 * esse mesmo número vai para o `versionCode` do Android e para a etiqueta da
 * Release (`apk-16`). Comparar números inteiros não tem casos especiais;
 * comparar `"7.0.9"` com `"7.0.10"` como texto dá a resposta errada.
 */

/** O que há do outro lado, quando há. */
export interface UpdateInfo {
  /** O número da compilação: 16 em `7.0.16`. É por aqui que se compara. */
  build: number;
  /** A versão como se lê: `7.0.16`. */
  version: string;
  /** De onde se descarrega o APK. */
  url: string;
  bytes: number;
  /** O texto da Release, que diz o que mudou. */
  notes: string;
}

export class UpdateError extends Error {}

/** A versão instalada, como se lê. */
export function currentVersion(): string {
  return Application.nativeApplicationVersion ?? '—';
}

/**
 * O número da compilação instalada.
 *
 * No Android é o `versionCode`, que o workflow põe igual ao número da execução.
 * Devolve 0 quando não se consegue saber — e aí não se anuncia nada, porque
 * anunciar uma atualização por não se saber a versão é pior do que ficar calado.
 */
export function currentBuild(): number {
  const bruto = Number(Application.nativeBuildVersion);
  return Number.isFinite(bruto) && bruto > 0 ? bruto : 0;
}

/**
 * Pergunta ao GitHub qual é a última versão publicada.
 *
 * Devolve `null` quando já se está na mais recente — e também quando não se sabe
 * que versão está instalada, pela razão dita em `currentBuild()`.
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const instalada = currentBuild();
  if (instalada === 0) {
    return null;
  }

  let lista: Release[];
  try {
    const resposta = await axios.get<Release[]>(RELEASES_API_URL, {
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        // O GitHub recusa pedidos sem User-Agent. O `Accept` fixa a versão da
        // API, para uma mudança futura do formato não partir isto em silêncio.
        'User-Agent': USER_AGENT,
        Accept: 'application/vnd.github+json',
      },
    });
    lista = Array.isArray(resposta.data) ? resposta.data : [];
  } catch {
    throw new UpdateError(t().errors.updateCheckFailed);
  }

  // **Só as Releases de APK.** As outras etiquetas deste repositório são os
  // mapas dos países e os horários — ver a nota em `RELEASES_API_URL`.
  //
  // Escolhe-se pelo maior número e não pela primeira da lista: a lista vem por
  // data, e uma Release corrigida à mão pode aparecer fora de ordem.
  let melhor: UpdateInfo | null = null;
  for (const entrada of lista) {
    if (entrada?.draft || entrada?.prerelease) {
      continue;
    }

    // A etiqueta é `apk-16`. É daqui que sai o número, e não do nome da Release:
    // o nome é texto escrito para se ler, a etiqueta é o que a compilação gera.
    const tag = String(entrada?.tag_name ?? '');
    if (!/^apk-\d+$/.test(tag)) {
      continue;
    }
    const build = Number(tag.slice(4));
    if (build <= instalada || (melhor && build <= melhor.build)) {
      continue;
    }

    // Uma Release sem o APK lá dentro não serve para nada — e acontece se uma
    // compilação falhar a meio do envio. Salta-se para a seguinte.
    const apk = (entrada.assets ?? []).find((a) => a?.name?.endsWith('.apk'));
    if (!apk?.browser_download_url) {
      continue;
    }

    melhor = {
      build,
      version: (entrada.name ?? '').replace(/^PalmMap\s+/, '') || `7.0.${build}`,
      url: apk.browser_download_url,
      bytes: apk.size ?? 0,
      notes: (entrada.body ?? '').trim(),
    };
  }

  return melhor;
}

/** Onde fica o APK enquanto espera por ser instalado. */
const PASTA = new Directory(Paths.cache, 'atualizacao');

/**
 * Descarrega o APK da versão nova.
 *
 * Vai para a **cache** e não para os documentos, de propósito: é um ficheiro de
 * quarenta megabytes que só serve uma vez, e na cache o Android pode deitá-lo
 * fora sozinho se precisar de espaço. Deixá-lo nos documentos era guardar para
 * sempre o instalador de uma versão que já foi instalada.
 *
 * O aviso de progresso é **por percentagem inteira e não por bocado escrito** —
 * ver a nota igual em `offlineMap.ts`, que é onde essa lição foi aprendida.
 */
export async function downloadUpdate(
  info: UpdateInfo,
  onProgress?: (fracao: number) => void,
): Promise<File> {
  if (!PASTA.exists) {
    PASTA.create({ intermediates: true });
  }

  // Um instalador de uma versão anterior não tem nada que ficar aqui a ocupar
  // espaço, e ter dois APKs na pasta era um convite a instalar o errado.
  for (const antigo of PASTA.list()) {
    antigo.delete();
  }

  const parcial = new File(PASTA, `PalmMap-${info.build}.apk.parcial`);
  let ultimaPercentagem = -1;

  try {
    const descarregado = await File.downloadFileAsync(info.url, parcial, {
      onProgress: ({ bytesWritten, totalBytes }) => {
        const total = totalBytes > 0 ? totalBytes : info.bytes;
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
    });

    // Só ganha o nome definitivo no fim. Um APK truncado que se chamasse `.apk`
    // era entregue ao instalador e dava "ocorreu um problema ao analisar o
    // pacote" — erro que neste projeto já custou tempo a perceber uma vez.
    const destino = new File(PASTA, `PalmMap-${info.build}.apk`);
    if (destino.exists) {
      destino.delete();
    }
    await descarregado.move(destino);
    return destino;
  } catch (erro) {
    if (parcial.exists) {
      parcial.delete();
    }
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    throw new UpdateError(t().errors.updateDownloadFailed(detalhe));
  }
}

/**
 * Entrega o APK ao instalador do Android.
 *
 * **Tem de ser um endereço `content://`, nunca o `file://`.** Desde o Android 7
 * que passar um `file://` a outra aplicação rebenta com `FileUriExposedException`
 * — e o instalador é outra aplicação. O `getContentUriAsync` devolve o endereço
 * através do FileProvider que o Expo já configura, e a bandeira `1`
 * (`FLAG_GRANT_READ_URI_PERMISSION`) é o que dá ao instalador licença para ler
 * um ficheiro que é nosso. Sem ela o endereço existe e não abre.
 *
 * Usa-se `ACTION_VIEW` com o tipo do pacote, e não o `INSTALL_PACKAGE`: este
 * último está desaconselhado desde o Android 10.
 */
export async function installUpdate(ficheiro: File): Promise<void> {
  try {
    const endereco = await getContentUriAsync(ficheiro.uri);
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: endereco,
      type: 'application/vnd.android.package-archive',
      flags: 1,
    });
  } catch (erro) {
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    throw new UpdateError(t().errors.updateInstallFailed(detalhe));
  }
}

/**
 * Só os campos que se usam, da resposta do GitHub.
 *
 * Os nomes foram lidos de uma resposta verdadeira deste repositório, não
 * adivinhados — é a regra que este projeto aprendeu à sua custa com a API da
 * Carris. Ver "Ler o código do serviço em vez de adivinhar os nomes dos campos",
 * no `CLAUDE.md`.
 */
interface Release {
  tag_name?: string;
  name?: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: { name?: string; size?: number; browser_download_url?: string }[];
}
