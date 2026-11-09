package expo.modules.palmmapvoice

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.speech.RecognizerIntent
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val REQUEST_CODE = 4711

/**
 * Opens Android's own speech recogniser and hands back **only the sentence heard**.
 *
 * It replaces opening the same screen through `expo-intent-launcher`, which
 * hands the whole result Bundle to JavaScript. When the recogniser hears
 * nothing it understands, Google's app puts extras in that Bundle that cannot be
 * read or converted in our process — and the failure happens in a native
 * callback, where no JavaScript `try` reaches: the app closed (the author's
 * report, November 2026). Here the one string wanted is read inside a `try`,
 * and anything else becomes "nothing heard".
 */
class VoiceInputModule : Module() {
  private var pending: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("PalmMapVoice")

    AsyncFunction("listen") { language: String, prompt: String, promise: Promise ->
      if (pending != null) {
        // A recogniser is already open; a second tap gets nothing.
        promise.resolve(null)
      } else {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
          putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
          putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
          putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, language)
          putExtra(RecognizerIntent.EXTRA_PROMPT, prompt)
          putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        }
        try {
          pending = promise
          appContext.throwingActivity.startActivityForResult(intent, REQUEST_CODE)
        } catch (e: ActivityNotFoundException) {
          pending = null
          promise.reject("E_NO_RECOGNIZER", "No speech recogniser on this phone", e)
        } catch (e: Throwable) {
          pending = null
          promise.reject("E_START_FAILED", e.message, e)
        }
      }
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode != REQUEST_CODE) {
        return@OnActivityResult
      }
      val promise = pending ?: return@OnActivityResult
      pending = null
      val heard: String? = try {
        if (payload.resultCode == Activity.RESULT_OK) {
          payload.data
            ?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
            ?.firstOrNull { it.isNotBlank() }
        } else {
          null
        }
      } catch (_: Throwable) {
        null
      }
      promise.resolve(heard)
    }
  }
}
