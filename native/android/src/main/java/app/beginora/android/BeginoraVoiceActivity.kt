package app.beginora.android

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.speech.RecognizerIntent
import android.os.Bundle
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import java.util.Locale

class BeginoraVoiceActivity : Activity() {

    companion object {
        private const val REQUEST_SPEECH = 1001
        private const val REQUEST_MIC_PERMISSION = 1002
        const val EXTRA_TRANSCRIPT = "beginora_voice_text"
        const val EXTRA_ERROR = "beginora_voice_error"
        const val EXTRA_NATIVE_BRIDGE = "beginora_native_voice_bridge"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.RECORD_AUDIO),
                REQUEST_MIC_PERMISSION,
            )
        } else {
            startSpeechRecognition()
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQUEST_MIC_PERMISSION) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                startSpeechRecognition()
            } else {
                finishWithError("permission_denied")
            }
        }
    }

    private fun startSpeechRecognition() {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault())
            putExtra(RecognizerIntent.EXTRA_PROMPT, "Talk to Beginora...")
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        }
        if (intent.resolveActivity(packageManager) == null) {
            finishWithError("unavailable")
            return
        }
        try {
            startActivityForResult(intent, REQUEST_SPEECH)
        } catch (_: Exception) {
            finishWithError("unavailable")
        }
    }

    @Deprecated("Using deprecated API for broad Android compatibility")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQUEST_SPEECH) return

        val spokenText = if (resultCode == RESULT_OK) {
            data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
        } else null
        if (!spokenText.isNullOrBlank()) {
            if (intent.getBooleanExtra(EXTRA_NATIVE_BRIDGE, false)) {
                setResult(RESULT_OK, Intent().putExtra(EXTRA_TRANSCRIPT, spokenText))
            } else {
                val returnToChat = Intent(this, MainActivity::class.java).apply {
                    action = Intent.ACTION_VIEW
                    setData(Uri.parse("beginora://chat?voice_text=${Uri.encode(spokenText)}"))
                    flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
                }
                startActivity(returnToChat)
            }
            finish()
        } else {
            finishWithError("cancelled")
        }
    }

    private fun finishWithError(error: String) {
        setResult(RESULT_CANCELED, Intent().putExtra(EXTRA_ERROR, error))
        finish()
    }
}
