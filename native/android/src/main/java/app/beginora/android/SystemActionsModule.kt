package app.beginora.android

import android.app.ActivityManager
import android.content.ComponentCallbacks2
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.os.Build
import android.provider.AlarmClock
import android.provider.CalendarContract
import com.facebook.react.bridge.*
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeParseException

class SystemActionsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ComponentCallbacks2 {

    override fun getName(): String = "SystemActionsModule"

    override fun initialize() {
        super.initialize()
        reactApplicationContext.applicationContext.registerComponentCallbacks(this)
    }

    override fun invalidate() {
        reactApplicationContext.applicationContext.unregisterComponentCallbacks(this)
        super.invalidate()
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
}
