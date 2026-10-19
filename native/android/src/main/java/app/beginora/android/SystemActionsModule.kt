package app.beginora.android

import android.app.ActivityManager
import android.app.Activity
import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.ComponentCallbacks2
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.os.Build
import android.provider.AlarmClock
import android.provider.CalendarContract
import android.provider.Settings
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.*
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeParseException

class SystemActionsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ComponentCallbacks2, ActivityEventListener {

    companion object {
        private const val VOICE_ACTIVITY_REQUEST = 4317
    }

    private var voicePromise: Promise? = null

    override fun getName(): String = "SystemActionsModule"

    override fun initialize() {
        super.initialize()
        reactApplicationContext.applicationContext.registerComponentCallbacks(this)
        reactApplicationContext.addActivityEventListener(this)
    }

    override fun invalidate() {
        reactApplicationContext.applicationContext.unregisterComponentCallbacks(this)
        reactApplicationContext.removeActivityEventListener(this)
        voicePromise?.reject("VOICE_CANCELLED", "Voice input ended before a result was returned.")
        voicePromise = null
        super.invalidate()
    }

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != VOICE_ACTIVITY_REQUEST) return
        val promise = voicePromise ?: return
        voicePromise = null
        val transcript = data?.getStringExtra(BeginoraVoiceActivity.EXTRA_TRANSCRIPT).orEmpty()
        val error = data?.getStringExtra(BeginoraVoiceActivity.EXTRA_ERROR)
        val result = Arguments.createMap()
        when {
            resultCode == Activity.RESULT_OK && transcript.isNotBlank() -> {
                result.putString("status", "success")
                result.putString("text", transcript)
            }
            error == "permission_denied" -> {
                result.putString("status", "denied")
                result.putString("error", "Microphone permission was not granted.")
            }
            error == "unavailable" -> {
                result.putString("status", "unavailable")
                result.putString("error", "Speech recognition is not available on this device.")
            }
            error == "failed" -> {
                result.putString("status", "failed")
                result.putString("error", "Speech recognition could not be started.")
            }
            else -> result.putString("status", "cancelled")
        }
        promise.resolve(result)
    }

    override fun onNewIntent(intent: Intent) {}

    @ReactMethod
    fun startVoiceRecognition(promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("VOICE_NO_ACTIVITY", "Beginora must be open to start voice input.")
            return
        }
        if (voicePromise != null) {
            promise.reject("VOICE_BUSY", "Voice input is already open.")
            return
        }
        try {
            voicePromise = promise
            activity.startActivityForResult(
                Intent(activity, BeginoraVoiceActivity::class.java)
                    .putExtra(BeginoraVoiceActivity.EXTRA_NATIVE_BRIDGE, true),
                VOICE_ACTIVITY_REQUEST,
            )
        } catch (e: Exception) {
            voicePromise = null
            promise.reject("VOICE_START_ERROR", e.message, e)
        }
    }

    override fun onTrimMemory(level: Int) {
        if (level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW) {
            emitMemoryWarning(level)
        }
    }

    override fun onLowMemory() {
        emitMemoryWarning(ComponentCallbacks2.TRIM_MEMORY_COMPLETE)
    }

    override fun onConfigurationChanged(newConfig: Configuration) {}

    private fun emitMemoryWarning(level: Int) {
        if (!reactApplicationContext.hasActiveReactInstance()) return
        reactApplicationContext.emitDeviceEvent("memoryWarning", level)
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    @ReactMethod
    fun getDeviceInfo(promise: Promise) {
        try {
            val am = reactApplicationContext
                .getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val mem = ActivityManager.MemoryInfo()
            am.getMemoryInfo(mem)
            val map = Arguments.createMap()
            map.putDouble("totalMemMb", mem.totalMem / (1024.0 * 1024.0))
            map.putDouble("availMemMb", mem.availMem / (1024.0 * 1024.0))
            map.putBoolean("lowRam", am.isLowRamDevice)
            map.putString("model", Build.MODEL)
            map.putString("manufacturer", Build.MANUFACTURER)
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("DEVICE_INFO_ERROR", e.message, e)
        }
    }

    private fun parseToMillis(dateStr: String): Long {
        return try {
            ZonedDateTime.parse(dateStr).toInstant().toEpochMilli()
        } catch (e: DateTimeParseException) {
            LocalDateTime.parse(dateStr)
                .atZone(ZoneId.systemDefault())
                .toInstant()
                .toEpochMilli()
        }
    }

    @ReactMethod
    fun setAlarm(hours: Int, minutes: Int, label: String, date: String, promise: Promise) {
        try {
            val intent = Intent(AlarmClock.ACTION_SET_ALARM).apply {
                putExtra(AlarmClock.EXTRA_HOUR, hours)
                putExtra(AlarmClock.EXTRA_MINUTES, minutes)
                putExtra(AlarmClock.EXTRA_SKIP_UI, true)
                if (label.isNotEmpty()) putExtra(AlarmClock.EXTRA_MESSAGE, label)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("SET_ALARM_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun setTimer(seconds: Int, label: String, promise: Promise) {
        try {
            val intent = Intent(AlarmClock.ACTION_SET_TIMER).apply {
                putExtra(AlarmClock.EXTRA_LENGTH, seconds)
                putExtra(AlarmClock.EXTRA_SKIP_UI, true)
                if (label.isNotEmpty()) putExtra(AlarmClock.EXTRA_MESSAGE, label)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("SET_TIMER_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun createCalendarEvent(title: String, start: String, end: String, location: String, promise: Promise) {
        try {
            val startMillis = parseToMillis(start)
            val endMillis = if (end.isNotEmpty()) parseToMillis(end) else startMillis + 3600000

            val intent = Intent(Intent.ACTION_INSERT).apply {
                data = CalendarContract.Events.CONTENT_URI
                putExtra(CalendarContract.Events.TITLE, title)
                putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, startMillis)
                putExtra(CalendarContract.EXTRA_EVENT_END_TIME, endMillis)
                if (location.isNotEmpty()) putExtra(CalendarContract.Events.EVENT_LOCATION, location)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve(null)
        } catch (e: DateTimeParseException) {
            promise.reject("CREATE_EVENT_ERROR", "Invalid date format: ${e.message}", e)
        } catch (e: Exception) {
            promise.reject("CREATE_EVENT_ERROR", e.message, e)
        }
    }

    // Usage access is a special app-op the user grants in system Settings; the
    // manifest declaration alone does not grant it.
    @ReactMethod
    fun hasUsageAccess(promise: Promise) {
        try {
            val appOps = reactApplicationContext.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
            val uid = android.os.Process.myUid()
            val pkg = reactApplicationContext.packageName
            val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                appOps.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, uid, pkg)
            } else {
                @Suppress("DEPRECATION")
                appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, uid, pkg)
            }
            promise.resolve(mode == AppOpsManager.MODE_ALLOWED)
        } catch (e: Exception) {
            promise.reject("USAGE_ACCESS_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun openUsageAccessSettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("USAGE_SETTINGS_ERROR", e.message, e)
        }
    }

    // Foreground app changes since sinceMs: package name, type and time only.
    @ReactMethod
    fun getAppEvents(sinceMs: Double, promise: Promise) {
        try {
            val usm = reactApplicationContext.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
            val events = usm.queryEvents(sinceMs.toLong(), System.currentTimeMillis())
            val event = UsageEvents.Event()
            val result = Arguments.createArray()
            while (events.hasNextEvent()) {
                events.getNextEvent(event)
                val type = when (event.eventType) {
                    UsageEvents.Event.ACTIVITY_RESUMED -> "resumed"
                    UsageEvents.Event.ACTIVITY_PAUSED -> "paused"
                    else -> null
                } ?: continue
                val map = Arguments.createMap()
                map.putString("packageName", event.packageName)
                map.putString("type", type)
                map.putDouble("time", event.timeStamp.toDouble())
                result.pushMap(map)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("USAGE_EVENTS_ERROR", e.message, e)
        }
    }
}
