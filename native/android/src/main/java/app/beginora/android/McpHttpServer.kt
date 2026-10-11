package app.beginora.android

import android.util.Log
import fi.iki.elonen.NanoHTTPD
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

class McpHttpServer(
    port: Int,
    private val activeTokens: () -> Set<String>,
    private val onRequest: (id: String, token: String, body: String) -> Unit,
) : NanoHTTPD("0.0.0.0", port) {

    private val pending = ConcurrentHashMap<String, CompletableFuture<Pair<Int, String>>>()
    private var counter = 0L

    fun complete(id: String, status: Int, body: String) {
        pending.remove(id)?.complete(status to body)
    }

    override fun serve(session: IHTTPSession): Response {
        if (session.method != Method.POST || session.uri != "/mcp") {
            return newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "Not found")
        }
        val auth = session.headers["authorization"] ?: ""
        val token = auth.removePrefix("Bearer ").trim()
        if (token.isEmpty() || token !in activeTokens()) {
            return newFixedLengthResponse(Response.Status.UNAUTHORIZED, "application/json",
                "{\"error\":\"unauthorized\"}")
        }

        val body = readBody(session)
        val id = synchronized(this) { "req-${counter++}" }
        val future = CompletableFuture<Pair<Int, String>>()

        return try {
            pending[id] = future
            onRequest(id, token, body)
            val (status, respBody) = future.get(30, TimeUnit.SECONDS)
            val nanoStatus = if (status == 200) Response.Status.OK else Response.Status.INTERNAL_ERROR
            if (status == 200 && respBody.isEmpty()) {
                newFixedLengthResponse(Response.Status.ACCEPTED, "application/json", "")
            } else {
                newFixedLengthResponse(nanoStatus, "application/json", respBody)
            }
        } catch (e: Exception) {
            pending.remove(id)
            Log.w("McpHttpServer", "request $id timed out or failed", e)
            newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "application/json",
                "{\"error\":\"timeout\"}")
        }
    }

    private fun readBody(session: IHTTPSession): String {
        val map = HashMap<String, String>()
        session.parseBody(map)
        return map["postData"] ?: ""
    }
}
