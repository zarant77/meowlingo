package com.catemup.meowlingo.data.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString

@Serializable
data class Reply(val id: String, val text: String, val type: String = "reply", val channel: String? = null, val recipient: String? = null)

@Serializable
data class ServerMessage(
    val type: String,
    val id: String? = null,
    val timestamp: String? = null,
    val channel: String? = null,
    val historyLimit: Int? = null,
    val replayed: Boolean = false,
    val author: String? = null,
    val original: String? = null,
    val translated: String? = null,
    val gameSendStatus: String? = null,
    val copiedToClipboard: Boolean? = null,
    val status: String? = null,
    val message: String? = null,
    val code: String? = null,
)


private val outgoingJson = kotlinx.serialization.json.Json { encodeDefaults = true; explicitNulls = false }
fun encodeReply(reply: Reply): String = outgoingJson.encodeToString(reply)

private val protocolJson = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }
private fun validId(id: String?): Boolean = id != null &&
    runCatching { java.util.UUID.fromString(id).toString().equals(id, true) }.getOrDefault(false)
private fun validTimestamp(timestamp: String?): Boolean = timestamp != null &&
    runCatching { java.time.Instant.parse(timestamp); true }.getOrDefault(false)

fun decodeServerMessage(text: String): ServerMessage {
    val message = protocolJson.decodeFromString<ServerMessage>(text)
    val valid = when (message.type) {
        "chat" -> validId(message.id) && validTimestamp(message.timestamp) && !message.author.isNullOrBlank() &&
            message.original != null && message.translated != null && (message.channel == null || message.channel.isNotBlank())
        "reply_ready" -> validId(message.id) && message.original != null && message.translated != null && message.copiedToClipboard != null
        "status" -> message.status in setOf("connected", "source_waiting", "source_watching", "source_error") && message.message != null
        "error" -> message.code != null && message.message != null && (message.id == null || validId(message.id))
        "pong" -> true
        else -> false
    }
    require(valid) { "Invalid server message" }
    return message
}
