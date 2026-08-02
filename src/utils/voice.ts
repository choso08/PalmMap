import * as Speech from 'expo-speech';

/**
 * Leitura das instruções em voz alta, em português.
 *
 * Se o telemóvel não tiver voz portuguesa instalada, o sistema usa a que
 * tiver. Nunca deixamos um erro daqui interromper a navegação: falhar a falar
 * é chato, mas o ecrã continua a mostrar tudo.
 */
export function speak(text: string): void {
  try {
    Speech.speak(text, { language: 'pt-PT', rate: 1.0 });
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
