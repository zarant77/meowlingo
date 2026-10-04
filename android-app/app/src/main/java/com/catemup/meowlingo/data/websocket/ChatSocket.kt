package com.catemup.meowlingo.data.websocket

import com.catemup.meowlingo.data.model.Reply
import com.catemup.meowlingo.data.model.ServerMessage
import com.catemup.meowlingo.data.model.decodeServerMessage
import com.catemup.meowlingo.data.model.encodeReply
import okhttp3.*
import java.util.concurrent.TimeUnit

class ChatSocket {
    private val client = OkHttpClient.Builder().pingInterval(20, TimeUnit.SECONDS).build()
    private var socket: WebSocket? = null
    @Volatile private var generation = 0

    fun connect(address: String, onStatus: (String) -> Unit, onMessage: (ServerMessage) -> Unit, onError: (String) -> Unit) {
        disconnect()
        val token = generation
        socket = client.newWebSocket(Request.Builder().url(address).build(), object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                if (token == generation) onStatus("Connected")
            }
            override fun onMessage(webSocket: WebSocket, text: String) {
                if (token != generation) return
                try {
                    val message = decodeServerMessage(text)
                    onMessage(message)
                } catch (_: Exception) { onError("Malformed server message ignored") }
            }
            override fun onMessage(webSocket: WebSocket, bytes: okio.ByteString) {
                if (token == generation) onError("Unexpected binary message ignored")
            }
            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) { webSocket.close(code, reason) }
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                if (token == generation) onStatus("Disconnected")
            }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                if (token == generation) { onError(t.message ?: "Network error"); onStatus("Disconnected") }
            }
        })
    }
    fun explain(id: String): Boolean = socket?.send(
        org.json.JSONObject().put("type", "explain").put("id", id).toString()) ?: false
    fun send(reply: Reply): Boolean = socket?.send(encodeReply(reply)) ?: false
    fun disconnect() { generation++; socket?.cancel(); socket = null }
    fun release() { disconnect(); client.dispatcher.executorService.shutdown(); client.connectionPool.evictAll() }
}
