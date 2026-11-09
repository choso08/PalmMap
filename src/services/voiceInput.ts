import AsyncStorage from '@react-native-async-storage/async-storage';
import * as IntentLauncher from 'expo-intent-launcher';

import { activeLanguage, speechTag, t } from '../i18n';

/** Set once the phone showed it has no speech recogniser. */
const NO_VOICE_KEY = 'palmmap.semReconhecimentoVoz';

/**
 * Whether to offer the microphone at all.
 *
 * Android gives JavaScript no way to ask "is there a recogniser?" without a
 * new native library, so the answer is learnt: the first time the screen fails
 * to open, it is written down and the microphone never shows again on that
 * phone. Practically every Android phone has one (the Google app's).
 */
export async function voiceAvailable(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(NO_VOICE_KEY)) !== '1';
  } catch {
    return true;
  }
}

/** Thrown when the phone has no speech recogniser at all. */
export class VoiceUnavailableError extends Error {}

/**
 * Ask the phone's own speech recogniser for one sentence.
 *
 * It is Android's `RECOGNIZE_SPEECH` screen, opened through
 * `expo-intent-launcher`, which the app already ships for updates: no new
 * library, no key, nothing sent by us anywhere. The phone's recogniser does the
 * listening (on most phones, Google's; it works offline when the language pack
 * is installed).
 *
 * Returns the best guess, or `null` when the person cancelled or said nothing.
 */
export async function listenOnce(): Promise<string | null> {
  const language = speechTag(activeLanguage());
  let result: IntentLauncher.IntentLauncherResult;
  try {
    result = await IntentLauncher.startActivityAsync('android.speech.action.RECOGNIZE_SPEECH', {
      extra: {
        'android.speech.extra.LANGUAGE_MODEL': 'free_form',
        'android.speech.extra.LANGUAGE': language,
        'android.speech.extra.LANGUAGE_PREFERENCE': language,
        'android.speech.extra.PROMPT': t().search.voicePrompt,
        'android.speech.extra.MAX_RESULTS': 1,
      },
    });
  } catch {
    // ActivityNotFoundException: no recogniser installed.
    await AsyncStorage.setItem(NO_VOICE_KEY, '1').catch(() => undefined);
    throw new VoiceUnavailableError('no speech recogniser');
  }
  if (result.resultCode !== IntentLauncher.ResultCode.Success) {
    return null;
  }
  const extra = result.extra as Record<string, unknown> | undefined;
  const heard = extra?.['android.speech.extra.RESULTS'];
  const first = Array.isArray(heard) ? heard[0] : null;
  return typeof first === 'string' && first.trim() ? first.trim() : null;
}
