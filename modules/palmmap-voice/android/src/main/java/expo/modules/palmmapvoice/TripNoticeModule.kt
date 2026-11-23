package expo.modules.palmmapvoice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.graphics.Color
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The trip under way in the notification shade with a progress bar, as Google
 * Maps shows it (author's request, 23 November 2026). `expo-notifications`
 * cannot draw a progress bar, hence this small piece of native code.
 *
 * One notification, replaced in place: quiet channel, ongoing while the trip
 * lasts, a tap brings the app back. On Android 16 and later it also asks to be
 * a "Live Update" (promoted, with a short text in the status bar chip) —
 * through reflection, so older SDKs and a missing permission change nothing.
 */
class TripNoticeModule : Module() {
  private fun manager(): NotificationManager? =
    appContext.reactContext?.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager

  override fun definition() = ModuleDefinition {
    Name("PalmMapTripNotice")

    /**
     * Shows or replaces the trip's notification. `progress` of `max`; a `max`
     * of 0 hides the bar. `chip` is the status bar's short text (Android 16+),
     * empty for none. Returns false when nothing could be posted.
     */
    // The options as one map: a module function takes at most a handful of
    // arguments, and these nine would not fit.
    Function("show") { id: Int, options: Map<String, Any?> ->
      try {
        val channelId = options["channelId"] as? String ?: "viagem"
        val channelName = options["channelName"] as? String ?: channelId
        val title = options["title"] as? String ?: ""
        val text = options["text"] as? String ?: ""
        val max = (options["max"] as? Number)?.toInt() ?: 0
        val progress = (options["progress"] as? Number)?.toInt() ?: 0
        val colour = options["colour"] as? String ?: ""
        val chip = options["chip"] as? String ?: ""
        val context = appContext.reactContext ?: return@Function false
        val nm = manager() ?: return@Function false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          if (nm.getNotificationChannel(channelId) == null) {
            val channel = NotificationChannel(channelId, channelName, NotificationManager.IMPORTANCE_LOW)
            channel.setSound(null, null)
            channel.enableVibration(false)
            channel.setShowBadge(false)
            nm.createNotificationChannel(channel)
          }
        }
        @Suppress("DEPRECATION")
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          Notification.Builder(context, channelId)
        } else {
          Notification.Builder(context)
        }
        // The white glyph `expo-notifications` draws from app.json; the app's
        // icon when it is missing.
        val icon = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
          .takeIf { it != 0 } ?: context.applicationInfo.icon
        builder.setSmallIcon(icon)
          .setContentTitle(title)
          .setContentText(text)
          .setOngoing(true)
          .setOnlyAlertOnce(true)
          .setShowWhen(false)
          .setCategory(Notification.CATEGORY_NAVIGATION)
        try {
          builder.setColor(Color.parseColor(colour))
        } catch (e: Exception) {
          // A bad colour leaves the system's.
        }
        if (max > 0) {
          builder.setProgress(max, progress.coerceIn(0, max), false)
        }
        context.packageManager.getLaunchIntentForPackage(context.packageName)?.let { launch ->
          launch.flags = android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP or
            android.content.Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
          val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
          builder.setContentIntent(PendingIntent.getActivity(context, id, launch, flags))
        }
        if (Build.VERSION.SDK_INT >= 36) {
          try {
            Notification.Builder::class.java
              .getMethod("setRequestPromotedOngoing", Boolean::class.javaPrimitiveType)
              .invoke(builder, true)
            if (chip.isNotEmpty()) {
              Notification.Builder::class.java
                .getMethod("setShortCriticalText", String::class.java)
                .invoke(builder, chip)
            }
          } catch (e: Exception) {
            // Not on this release: an ordinary ongoing notification.
          }
        }
        nm.notify(id, builder.build())
        true
      } catch (e: Exception) {
        false
      }
    }

    Function("cancel") { id: Int ->
      try {
        manager()?.cancel(id)
      } catch (e: Exception) {
        // Nothing to remove.
      }
      Unit
    }
  }
}
