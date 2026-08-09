import * as Speech from 'expo-speech';

import { activeLanguage, speechTag } from '../i18n';

/**
 * Leitura das instruções em voz alta, na língua da aplicação.
 *
 * **A língua é a da aplicação e não a do telemóvel.** Quem põe a aplicação em
 * inglês quer as instruções em inglês, e ouvir uma frase inglesa lida com
 * pronúncia portuguesa é pior do que não a ouvir — a conduzir, o que interessa é
 * perceber-se à primeira.
 *
 * Se o telemóvel não tiver a voz dessa língua instalada, o sistema usa a que
 * tiver. Nunca deixamos um erro daqui interromper a navegação: falhar a falar
 * é chato, mas o ecrã continua a mostrar tudo.
 */
export function speak(text: string): void {
  try {
    Speech.speak(text, { language: speechTag(activeLanguage()), rate: 1.0 });
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
