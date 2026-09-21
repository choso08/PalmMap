import * as Speech from 'expo-speech';

import { activeLanguage, speechTag, type Language } from '../i18n';

/**
 * Leitura das instruções em voz alta, na língua da aplicação.
 *
 * **A língua é a da aplicação e não a do telemóvel.** Quem põe a aplicação em
 * inglês quer as instruções em inglês, e ouvir uma frase inglesa lida com
 * pronúncia portuguesa é pior do que não a ouvir — a conduzir, o que interessa é
 * perceber-se à primeira.
 *
 * Nunca deixamos um erro daqui interromper a navegação: falhar a falar é chato,
 * mas o ecrã continua a mostrar tudo.
 *
 * ## Porque é que a voz se escolhe à mão
 *
 * Dizer só `language: 'pt-PT'` e deixar o sistema escolher **não chega**, e era
 * daí que vinha a voz estranha. Duas razões, e as duas se ouvem:
 *
 * 1. **A região.** Se o telemóvel não tiver português de Portugal instalado, o
 *    Android serve o que tiver — e o português do Brasil lê "Rua Augusta" com
 *    outra pronúncia e outra entoação. A língua bate certo e o sotaque não.
 * 2. **A qualidade.** O Android costuma trazer duas vozes por língua: uma
 *    pequena, que vive no telemóvel, e uma que vem da Internet, bastante mais
 *    natural. A que responde por omissão é quase sempre a pequena.
 *
 * Por isso pergunta-se ao telemóvel que vozes tem e fica-se com a melhor —
 * primeiro a região certa, depois a qualidade. Se não houver nenhuma que sirva,
 * volta-se ao comportamento de antes: diz-se a língua e o sistema que escolha.
 *
 * ## ⚠️ Não se pergunta nada ao motor de voz antes de ele responder
 *
 * **Isto é a parte mais importante deste ficheiro, e custou uma versão inteira.**
 * A primeira tentativa perguntava a lista das vozes no arranque, e a aplicação
 * passou a fechar-se sozinha — ora mal abria, ora uns segundos depois, ora ao
 * calcular um percurso. Três sintomas, uma causa.
 *
 * O `SpeechModule.kt` do `expo-speech` faz isto: o motor de voz do Android só
 * arranca à primeira utilização e leva alguns segundos a ficar pronto. Quem lhe
 * pedir alguma coisa antes disso **fica numa fila**, e essa fila é despejada
 * dentro do `onInit` — que é uma função de retorno simples, **sem `try` nenhum à
 * volta**. Uma exceção ali não é uma promessa recusada: é uma exceção por apanhar
 * numa linha de execução do Android, e isso fecha a aplicação sem mais.
 *
 * E há mesmo o que rebentar: `textToSpeech.voices` **atira exceção** em vários
 * motores de voz do Android — é um defeito conhecido, e o `expo-speech` embrulha-o
 * num `SpeechUnableToGetVoicesException`. Dentro de um `AsyncFunction` isso
 * vira uma promessa recusada, que o nosso `catch` trata; dentro do `onInit` é
 * uma aplicação fechada.
 *
 * **Duas coisas nossas tocavam nessa propriedade**, e as duas podiam cair na
 * fila: pedir a lista das vozes, e **mandar falar com uma voz escolhida** — o
 * `speakOut` também percorre o `textToSpeech.voices` para encontrar a que se lhe
 * indicou.
 *
 * A regra que fica, e que **não se deve desfazer**:
 *
 * > Enquanto o motor de voz não tiver dado um sinal de vida, não se lhe pergunta
 * > a lista das vozes nem se lhe indica nenhuma. Diz-se só a língua, que é o
 * > caminho que nunca toca no `voices`.
 *
 * O sinal de vida é qualquer um dos avisos de uma leitura — começou, acabou, foi
 * calada ou falhou. Qualquer deles prova que o motor já arrancou, e a partir daí
 * perguntar é seguro, porque a resposta já não passa pela fila.
 *
 * **O que isto custa é a primeira frase**, lida com a voz que o sistema
 * escolher. A segunda já vai com a escolhida. É um preço pequeno ao pé de a
 * aplicação fechar-se a meio de uma estrada.
 */

/**
 * Se o motor de voz já deu sinal de vida.
 *
 * Enquanto for falso, não se lhe pergunta nada nem se lhe indica voz nenhuma —
 * ver a nota grande acima. Passa a verdadeiro no primeiro aviso de uma leitura.
 */
let motorPronto = false;

/** A voz escolhida para cada língua. `null` quer dizer "não há nenhuma boa". */
const escolhidas = new Map<Language, string | null>();

/**
 * Se a voz escolhida é mesmo da região certa — português **de Portugal**, e não
 * do Brasil.
 *
 * Interessa saber porque é a diferença que se ouve, e porque a aplicação não
 * pode fazer nada quanto a isso: instalar vozes é coisa das definições do
 * Android. O que dá para fazer é dizê-lo a quem está a ouvir um sotaque que não
 * pediu — ver o ecrã de definições.
 */
const regiaoCerta = new Map<Language, boolean>();

/**
 * Quão bem esta voz serve para esta língua. Negativo quer dizer "não serve".
 *
 * Os pesos são propositadamente desiguais: **a região vale mais do que a
 * qualidade**. Uma voz portuguesa pequena é preferível a uma voz brasileira
 * bonita, porque o que se está a ler são nomes de ruas portuguesas.
 */
function quaoBoa(voz: Speech.Voice, alvo: string): number {
  const lingua = (voz.language ?? '').replace('_', '-').toLowerCase();
  const pretendida = alvo.toLowerCase();
  const raiz = pretendida.split('-')[0];

  if (lingua !== pretendida && !lingua.startsWith(`${raiz}-`) && lingua !== raiz) {
    return -1;
  }

  let pontos = lingua === pretendida ? 100 : 10;
  if (voz.quality === Speech.VoiceQuality.Enhanced) {
    pontos += 20;
  }
  // No Android as vozes que vêm da Internet dizem-no no identificador, e são as
  // que soam a gente. A qualidade declarada não as distingue — quase todas se
  // dizem `Default`.
  if ((voz.identifier ?? '').toLowerCase().includes('network')) {
    pontos += 15;
  }
  return pontos;
}

/**
 * Descobre a melhor voz de cada língua e guarda-a.
 *
 * Corre-se uma vez, no arranque. **Não se pode fazer isto dentro do `speak()`**:
 * pedir a lista das vozes é assíncrono e o `speak()` é chamado de dentro do
 * motor de navegação, que não pode esperar por nada. Enquanto não estiver
 * resolvido, fala-se como antes — o que se perde é a escolha, não a voz.
 */
export async function prepareVoices(): Promise<void> {
  // **Nunca antes de o motor responder.** Ver a nota grande no cimo do ficheiro:
  // antes disso o pedido fica numa fila que é despejada sem proteção nenhuma, e
  // uma lista de vozes que rebente ali fecha a aplicação.
  if (!motorPronto || escolhidas.size > 0) {
    return;
  }

  try {
    const vozes = await Speech.getAvailableVoicesAsync();

    for (const lingua of ['pt', 'en'] as Language[]) {
      const alvo = speechTag(lingua);
      let melhor: { id: string; pontos: number } | null = null;

      for (const voz of vozes) {
        const pontos = quaoBoa(voz, alvo);
        if (pontos >= 0 && (!melhor || pontos > melhor.pontos)) {
          melhor = { id: voz.identifier, pontos };
        }
      }

      escolhidas.set(lingua, melhor?.id ?? null);
      // Cem pontos é o que só a região exata dá — ver `quaoBoa`.
      regiaoCerta.set(lingua, (melhor?.pontos ?? 0) >= 100);
    }
  } catch {
    // Sem lista de vozes, fica tudo como estava: diz-se a língua e o sistema
    // escolhe. Não é motivo para ficar sem voz.
  }
}

/**
 * Se o telemóvel tem voz da região desta língua.
 *
 * `null` enquanto a lista de vozes ainda não foi lida — nesse caso não se diz
 * nada, que é melhor do que avisar de um problema que pode não existir.
 */
export function hasRegionVoice(language: Language): boolean | null {
  return regiaoCerta.has(language) ? (regiaoCerta.get(language) as boolean) : null;
}

/**
 * O motor acabou de dar sinal de vida. A partir daqui já se lhe pode perguntar.
 *
 * Serve os quatro avisos — começou, acabou, foi calada, falhou — porque qualquer
 * um deles prova a mesma coisa: o motor arrancou. Até o erro serve.
 */
function aoResponder(): void {
  if (motorPronto) {
    return;
  }
  motorPronto = true;
  void prepareVoices();
}

export function speak(text: string): void {
  try {
    const lingua = activeLanguage();
    // A voz escolhida só entra depois de o motor ter respondido: indicá-la antes
    // punha o `speakOut` a percorrer o `textToSpeech.voices` de dentro da fila,
    // que é o caminho que fecha a aplicação. A primeira frase vai com a voz que
    // o sistema escolher, e é a única.
    const voz = motorPronto ? escolhidas.get(lingua) : null;
    Speech.speak(text, {
      language: speechTag(lingua),
      rate: 1.0,
      ...(voz ? { voice: voz } : {}),
      ...(motorPronto
        ? {}
        : {
            onStart: aoResponder,
            onDone: aoResponder,
            onStopped: aoResponder,
            onError: aoResponder,
          }),
    });
  } catch {
    // Sem voz, segue-se pelo ecrã.
  }
}

/** Cala o que estiver a ser dito. Usar ao terminar a navegação. */
export function stopSpeaking(): void {
  try {
    void Speech.stop();
  } catch {
    // Nada a fazer.
  }
}
