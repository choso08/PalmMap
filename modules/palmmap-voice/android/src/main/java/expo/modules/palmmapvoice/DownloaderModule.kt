package expo.modules.palmmapvoice

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Environment
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Downloads through Android's own DownloadManager, which keeps going with the
 * app in the background, the screen off or the app closed (author's photo,
 * 19 November 2026: the update download died with "Software caused
 * connection abort" when the app was sent to the background — the app's own
 * HTTP connection is cut there, the system's is not).
 *
 * The file lands in the app's own external folder (`Android/data/<app>/files/
 * Download`), which needs no storage permission; the system shows its own
 * progress notification. JavaScript polls `status` and copies the finished
 * file where it wants it.
 */
class DownloaderModule : Module() {
  private fun manager(): DownloadManager? =
    appContext.reactContext?.getSystemService(Context.DOWNLOAD_SERVICE) as? DownloadManager

  override fun definition() = ModuleDefinition {
    Name("PalmMapDownloader")

    /**
     * Starts a download; returns its id (as text — a Long does not fit a JS
     * number safely), or "" when the system will not take it (service missing,
     * the Download Manager app disabled). `allowMetered` false keeps it to
     * unmetered networks (Wi-Fi): the automatic map refresh must not carry on
     * over mobile data once the phone leaves the Wi-Fi it started on.
     */
    Function("start") { url: String, fileName: String, title: String, userAgent: String,
      allowMetered: Boolean, allowRoaming: Boolean ->
      try {
        val context = appContext.reactContext ?: return@Function ""
        val dm = manager() ?: return@Function ""
        // A file of the same name left by an earlier try would make the system
        // pick "name-1.apk": cleared first.
        context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)?.let { dir ->
          File(dir, fileName).takeIf { it.exists() }?.delete()
        }
        val request = DownloadManager.Request(Uri.parse(url))
          .setTitle(title)
          .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
          .setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, fileName)
          .setAllowedOverMetered(allowMetered)
          .setAllowedOverRoaming(allowRoaming)
          .addRequestHeader("User-Agent", userAgent)
        dm.enqueue(request).toString()
      } catch (e: Exception) {
        ""
      }
    }

    /**
     * Where a download is: `{ state, bytes, total, reason, path }`, state being
     * pending, running, paused, done, failed or missing.
     */
    Function("status") { id: String ->
      val dm = manager() ?: return@Function mapOf("state" to "missing")
      val query = DownloadManager.Query().setFilterById(id.toLongOrNull() ?: -1L)
      try {
        dm.query(query)?.use { c ->
          if (!c.moveToFirst()) {
            return@Function mapOf("state" to "missing")
          }
          val status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
          val bytes = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
          val total = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
          val reason = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON))
          val local = c.getString(c.getColumnIndexOrThrow(DownloadManager.COLUMN_LOCAL_URI))
          val state = when (status) {
            DownloadManager.STATUS_PENDING -> "pending"
            DownloadManager.STATUS_RUNNING -> "running"
            DownloadManager.STATUS_PAUSED -> "paused"
            DownloadManager.STATUS_SUCCESSFUL -> "done"
            DownloadManager.STATUS_FAILED -> "failed"
            else -> "pending"
          }
          mapOf(
            "state" to state,
            "bytes" to bytes.toDouble(),
            "total" to total.toDouble(),
            "reason" to reason,
            "path" to (local ?: ""),
          )
        } ?: mapOf("state" to "missing")
      } catch (e: Exception) {
        mapOf("state" to "missing")
      }
    }

    /** Cancels a download and deletes what it wrote. */
    Function("remove") { id: String ->
      try {
        manager()?.remove(id.toLongOrNull() ?: -1L)
        true
      } catch (e: Exception) {
        // Already gone.
        false
      }
    }
  }
}
