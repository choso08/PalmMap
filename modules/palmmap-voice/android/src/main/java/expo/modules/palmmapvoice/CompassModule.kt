package expo.modules.palmmapvoice

import android.content.Context
import android.hardware.GeomagneticField
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.SystemClock
import android.os.Bundle
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.atan2
import kotlin.math.hypot

private const val EVENT = "heading"

/** Readings closer together than this are not sent (about 15 a second). */
private const val MIN_INTERVAL_MS = 66L

/** Low-pass weight for the raw accelerometer and magnetometer fallback. */
private const val RAW_SMOOTHING = 0.15f

/**
 * Which way the phone points, for the cone in front of the blue dot.
 *
 * `expo-location`'s heading was the raw accelerometer + magnetometer sum, with
 * no filter, read through `getOrientation` — which goes wild when the phone is
 * held upright, the way one holds it to look round (author's report, November
 * 2026: "very buggy", on several phones). Here:
 *
 * 1. **Android's fused rotation vector** first (`TYPE_ROTATION_VECTOR`:
 *    gyroscope, accelerometer and magnetometer, filtered by the system), then
 *    the one without gyroscope (`TYPE_GEOMAGNETIC_ROTATION_VECTOR`, cheap
 *    phones), and only then the raw pair, low-passed here.
 * 2. **The direction is the top of the phone and its back together**: the top
 *    edge's direction when lying flat, the back camera's when upright, the same
 *    direction in between — so no angle of the phone gives a jumping heading.
 *    (The app is portrait only, so the screen's rotation never changes it.)
 * 3. **True north**, with the declination for the last known position.
 *
 * Sends `heading` events: `{ degrees, accuracy }`, accuracy being Android's
 * 0 (unreliable) to 3 (high).
 */
class CompassModule : Module(), SensorEventListener {
  private var manager: SensorManager? = null
  private var declination = 0f
  private var accuracy = 3
  private var lastSent = 0L
  private var gravity: FloatArray? = null
  private var geomagnetic: FloatArray? = null
  private val rotation = FloatArray(9)

  override fun definition() = ModuleDefinition {
    Name("PalmMapCompass")
    Events(EVENT)

    /** Starts; true when the phone has any compass at all. */
    Function("start") { latitude: Double?, longitude: Double? ->
      stopListening()
      declination = if (latitude != null && longitude != null) {
        try {
          GeomagneticField(latitude.toFloat(), longitude.toFloat(), 0f, System.currentTimeMillis()).declination
        } catch (_: Throwable) {
          0f
        }
      } else {
        0f
      }
      startListening()
    }

    Function("stop") {
      stopListening()
    }

    OnDestroy {
      stopListening()
    }
  }

  private fun startListening(): Boolean {
    val context = appContext.reactContext ?: return false
    val sensors = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager ?: return false
    manager = sensors
    gravity = null
    geomagnetic = null
    accuracy = 3
    val fused = sensors.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
      ?: sensors.getDefaultSensor(Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR)
    if (fused != null) {
      return sensors.registerListener(this, fused, SensorManager.SENSOR_DELAY_UI)
    }
    val accel = sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    val magnet = sensors.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)
    if (accel == null || magnet == null) {
      manager = null
      return false
    }
    sensors.registerListener(this, accel, SensorManager.SENSOR_DELAY_UI)
    sensors.registerListener(this, magnet, SensorManager.SENSOR_DELAY_UI)
    return true
  }

  private fun stopListening() {
    try {
      manager?.unregisterListener(this)
    } catch (_: Throwable) {
    }
    manager = null
  }

  override fun onAccuracyChanged(sensor: Sensor?, value: Int) {
    if (sensor?.type != Sensor.TYPE_ACCELEROMETER) {
      accuracy = value
    }
  }

  override fun onSensorChanged(event: SensorEvent?) {
    event ?: return
    try {
      val ok = when (event.sensor.type) {
        Sensor.TYPE_ROTATION_VECTOR, Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR -> {
          SensorManager.getRotationMatrixFromVector(rotation, event.values)
          true
        }
        Sensor.TYPE_ACCELEROMETER -> {
          gravity = lowPass(event.values, gravity)
          rotationFromRaw()
        }
        Sensor.TYPE_MAGNETIC_FIELD -> {
          geomagnetic = lowPass(event.values, geomagnetic)
          rotationFromRaw()
        }
        else -> false
      }
      if (!ok) return
      val now = SystemClock.elapsedRealtime()
      if (now - lastSent < MIN_INTERVAL_MS) return
      // The matrix maps the phone's axes to the world's (x east, y north, z up).
      // Top edge = the phone's +y (column 1); back = the phone's -z (column 2).
      val east = rotation[1] - rotation[2]
      val north = rotation[4] - rotation[5]
      if (hypot(east, north) < 0.1f) return
      val magnetic = Math.toDegrees(atan2(east, north).toDouble()).toFloat()
      val degrees = ((magnetic + declination) % 360f + 360f) % 360f
      lastSent = now
      sendEvent(
        EVENT,
        Bundle().apply {
          putDouble("degrees", degrees.toDouble())
          putInt("accuracy", accuracy)
        }
      )
    } catch (_: Throwable) {
      // A bad reading is skipped; a native exception here would close the app.
    }
  }

  private fun rotationFromRaw(): Boolean {
    val g = gravity ?: return false
    val m = geomagnetic ?: return false
    return SensorManager.getRotationMatrix(rotation, null, g, m)
  }

  private fun lowPass(values: FloatArray, previous: FloatArray?): FloatArray {
    if (previous == null) return values.copyOf(3)
    for (i in 0 until 3) {
      previous[i] += (values[i] - previous[i]) * RAW_SMOOTHING
    }
    return previous
  }
}
