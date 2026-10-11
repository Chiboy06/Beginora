package app.beginora.android

import android.content.Intent
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*

class BeginoraServiceModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "BeginoraServiceModule"

    @ReactMethod
    fun startService(promise: Promise) {
        try {
            val intent = Intent(reactApplicationContext, BeginoraService::class.java)
            ContextCompat.startForegroundService(reactApplicationContext, intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("START_SERVICE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun stopService(promise: Promise) {
        try {
            val intent = Intent(reactApplicationContext, BeginoraService::class.java)
            reactApplicationContext.stopService(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("STOP_SERVICE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun updateNotification(status: String, promise: Promise) {
        try {
            val intent = Intent(reactApplicationContext, BeginoraService::class.java).apply {
                action = BeginoraService.ACTION_UPDATE_STATUS
                putExtra(BeginoraService.EXTRA_STATUS, status)
            }
            ContextCompat.startForegroundService(reactApplicationContext, intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("UPDATE_NOTIFICATION_ERROR", e.message, e)
        }
    }
}
