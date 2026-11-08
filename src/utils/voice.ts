import * as Speech from 'expo-speech';

import { activeLanguage, speechTag, type Language } from '../i18n';

/**
 * Reading the instructions out loud, in the app's language.
 *
 * **The language is the app's, not the phone's.** Someone who sets the app to
 * English wants the instructions in English, and hearing an English sentence
 * read with a Portuguese accent is worse than not hearing it — while driving,
 * what matters is being understood the first time.
 *
 * An error here is never allowed to interrupt navigation: failing to speak is
 * annoying, but the screen still shows everything.
 *
 * ## Why the voice is picked by hand
 *
 * Saying only `language: 'pt-PT'` and letting the system choose **is not
 * enough**, and that is where the odd voice came from. Two reasons, and both
 * can be heard:
 *
 * 1. **The region.** If the phone does not have European Portuguese installed,
 *    Android serves whatever it has — and Brazilian Portuguese reads "Rua
 *    Augusta" with a different pronunciation and intonation. The language
 *    matches and the accent does not.
 * 2. **The quality.** Android usually ships two voices per language: a small
 *    one that lives on the phone, and one that comes from the Internet, quite a
 *    lot more natural. The one that answers by default is almost always the
 *    small one.
 *
 * So the phone is asked which voices it has and the best one is kept — the
 * right region first, then quality. If none fits, it falls back to the old
 * behaviour: give the language and let the system choose.
 *
 * ## ⚠️ Ask the speech engine nothing before it has answered
 *
 * **This is the most important part of this file, and it cost a whole
 * release.** The first attempt asked for the list of voices at start-up, and
 * the app started closing on its own — sometimes as it opened, sometimes a few
 * seconds later, sometimes while calculating a route. Three symptoms, one
 * cause. (In the end the crash had a different cause — see section "10-B" of
 * CLAUDE.md — but this trap is real and stays guarded.)
 *
 * `expo-speech`'s `SpeechModule.kt` does this: Android's speech engine only
 * starts on first use and takes a few seconds to be ready. Anyone who asks it
 * something before that **is put in a queue**, and that queue is flushed inside
 * `onInit` — a plain callback, **with no `try` around it**. An exception there
 * is not a rejected promise: it is an uncaught exception on an Android thread,
 * and that closes the app outright.
 *
 * And there really is something to blow up: `textToSpeech.voices` **throws** on
 * several Android speech engines — it is a known defect, and `expo-speech`
 * wraps it in a `SpeechUnableToGetVoicesException`. Inside an `AsyncFunction`
 * that becomes a rejected promise, which our `catch` handles; inside `onInit`
 * it is a closed app.
 *
 * **Two things of ours touched that property**, and both could land in the
 * queue: asking for the list of voices, and **asking it to speak with a chosen
 * voice** — `speakOut` also walks `textToSpeech.voices` to find the one it was
 * given.
 *
 * The rule that stays, and that **must not be undone**:
 *
 * > Until the speech engine has given a sign of life, do not ask it for the
 * > list of voices nor point it at one. Give only the language, which is the
 * > path that never touches `voices`.
 *
 * The sign of life is any of an utterance's callbacks — started, done, stopped
 * or failed. Any of them proves the engine has started, and from then on
 * asking is safe, because the answer no longer goes through the queue.
 *
 * **What it costs is the first sentence**, read with whatever voice the system
 * chooses. The second already goes with the chosen one. A small price next to
 * the app closing in the middle of a road.
 */

/**
 * Whether the speech engine has already given a sign of life.
 *
 * While false, it is asked nothing and pointed at no voice — see the big note
 * above. It becomes true on the first callback of an utterance.
 */
let engineReady = false;

/** The voice chosen for each language. `null` means "there is no good one". */
const chosenVoices = new Map<Language, string | null>();

/**
 * Whether the chosen voice really is from the right region — Portuguese **from
 * Portugal**, not from Brazil.
 *
 * It is worth knowing because it is the difference that can be heard, and
 * because the app can do nothing about it: installing voices belongs to
 * Android's settings. What it can do is tell someone who is hearing an accent
 * they did not ask for — see the settings screen.
 */
const rightRegion = new Map<Language, boolean>();

/** How well this voice suits this language. Negative means "it doesn't". */
function voiceScore(voice: Speech.Voice, target: string): number {
  const language = (voice.language ?? '').replace('_', '-').toLowerCase();
  const wanted = target.toLowerCase();
  const root = wanted.split('-')[0];

  if (language !== wanted && !language.startsWith(`${root}-`) && language !== root) {
    return -1;
  }

  // The weights are deliberately uneven: **the region is worth more than the
  // quality**. A small Portuguese voice beats a pretty Brazilian one, because
  // what is being read is Portuguese street names.
  let points = language === wanted ? 100 : 10;
  if (voice.quality === Speech.VoiceQuality.Enhanced) {
    points += 20;
  }
  // On Android the voices that come from the Internet say so in their
  // identifier, and they are the ones that sound like people. The declared
  // quality does not tell them apart — almost all say `Default`.
  if ((voice.identifier ?? '').toLowerCase().includes('network')) {
    points += 15;
  }
  return points;
}

/**
 * Works out the best voice for each language and keeps it.
 *
 * Runs once. **This cannot be done inside `speak()`**: asking for the list of
 * voices is asynchronous and `speak()` is called from inside the navigation
 * engine, which cannot wait for anything. Until it is resolved, speech works as
 * before — what is lost is the choice, not the voice.
 */
export async function prepareVoices(): Promise<void> {
  // **Never before the engine answers.** See the big note at the top of the
  // file: before that the request goes into a queue flushed with no protection
  // at all, and a voice list that blows up there closes the app.
  if (!engineReady || chosenVoices.size > 0) {
    return;
  }

  try {
    const voices = await Speech.getAvailableVoicesAsync();

    for (const language of ['pt', 'en'] as Language[]) {
      const target = speechTag(language);
      let best: { id: string; points: number } | null = null;

      for (const voice of voices) {
        const points = voiceScore(voice, target);
        if (points >= 0 && (!best || points > best.points)) {
          best = { id: voice.identifier, points };
        }
      }

      chosenVoices.set(language, best?.id ?? null);
      // A hundred points is what only the exact region gives — see
      // `voiceScore`.
      rightRegion.set(language, (best?.points ?? 0) >= 100);
    }
  } catch {
    // Without a voice list, everything stays as it was: give the language and
    // the system chooses. No reason to go without a voice.
  }
}

/**
 * Whether the phone has a voice from this language's region.
 *
 * `null` while the voice list has not been read yet — in that case nothing is
 * said, which beats warning about a problem that may not exist.
 */
export function hasRegionVoice(language: Language): boolean | null {
  return rightRegion.has(language) ? (rightRegion.get(language) as boolean) : null;
}

/**
 * The engine has just given a sign of life. From here on it can be asked.
 *
 * It serves the four callbacks — started, done, stopped, failed — because any
 * of them proves the same thing: the engine has started. Even the error will
 * do.
 */
function onEngineAnswer(): void {
  if (engineReady) {
    return;
  }
  engineReady = true;
  void prepareVoices();
}

export function speak(text: string): void {
  try {
    const language = activeLanguage();
    // The chosen voice only comes in after the engine has answered: giving it
    // earlier made `speakOut` walk `textToSpeech.voices` from inside the queue,
    // which is the path that closes the app. The first sentence goes with the
    // voice the system picks, and it is the only one.
    const voice = engineReady ? chosenVoices.get(language) : null;
    Speech.speak(text, {
      language: speechTag(language),
      rate: 1.0,
      ...(voice ? { voice } : {}),
      ...(engineReady
        ? {}
        : {
            onStart: onEngineAnswer,
            onDone: onEngineAnswer,
            onStopped: onEngineAnswer,
            onError: onEngineAnswer,
          }),
    });
  } catch {
    // Without a voice, the screen carries on guiding.
  }
}

/** Silences whatever is being said. Use when navigation ends. */
export function stopSpeaking(): void {
  try {
    void Speech.stop();
  } catch {
    // Nothing to do.
  }
}
