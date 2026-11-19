package expo.modules.palmmapvoice

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Seals what the app learns about the person's movements (author, 19 November
 * 2026: "it has to be bulletproof"). AES-256-GCM with a key made inside
 * Android's Keystore: it never leaves it — not readable by the app's own code,
 * not in any backup, gone with the app — so the stored text is useless
 * anywhere else, a rooted copy of the app's folder included.
 *
 * `seal` returns "" and `open` returns null on any failure: the caller then
 * keeps nothing rather than something in the clear.
 */
class VaultModule : Module() {
  private val alias = "palmmap-aprendizagem"

  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(alias, null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(
      KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build(),
    )
    return generator.generateKey()
  }

  override fun definition() = ModuleDefinition {
    Name("PalmMapVault")

    Function("seal") { text: String ->
      try {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val sealed = cipher.doFinal(text.toByteArray(Charsets.UTF_8))
        // "v1:" + IV + ciphertext (with its tag), base64.
        "v1:" + Base64.encodeToString(cipher.iv + sealed, Base64.NO_WRAP)
      } catch (e: Exception) {
        ""
      }
    }

    Function("open") { sealed: String ->
      try {
        if (!sealed.startsWith("v1:")) {
          return@Function null
        }
        val bytes = Base64.decode(sealed.substring(3), Base64.NO_WRAP)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes, 0, 12))
        String(cipher.doFinal(bytes, 12, bytes.size - 12), Charsets.UTF_8)
      } catch (e: Exception) {
        null
      }
    }

    /** Destroys the key: everything sealed with it becomes unreadable for good. */
    Function("destroy") {
      try {
        KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.deleteEntry(alias)
        true
      } catch (e: Exception) {
        false
      }
    }
  }
}
