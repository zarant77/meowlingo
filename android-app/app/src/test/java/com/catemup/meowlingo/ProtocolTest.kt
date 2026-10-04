package com.catemup.meowlingo

import com.catemup.meowlingo.data.model.Reply
import com.catemup.meowlingo.data.model.encodeReply
import com.catemup.meowlingo.data.model.decodeServerMessage
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Test

class ProtocolTest {
    private val chat = """{"type":"chat","id":"23dfc96c-984a-4358-9fa7-12fd71ace12a","timestamp":"2026-10-03T12:00:00.000Z","author":"Player","channel":"Safehouse","original":"Hello","translated":"Hello","replayed":true}"""
    @Test fun decodesChannelsAndReplay() {
        val message = decodeServerMessage(chat)
        assertEquals("Safehouse", message.channel)
        assertTrue(message.replayed)
        assertEquals(message.original, message.translated)
    }
    @Test fun acceptsOlderChatWithoutChannel() {
        assertNull(decodeServerMessage(chat.replace("\"channel\":\"Safehouse\",", "")).channel)
    }
    @Test fun rejectsMalformedMessages() {
        listOf("{", "{\"type\":\"unknown\"}", chat.replace("Safehouse", ""),
            chat.replace("23dfc96c-984a-4358-9fa7-12fd71ace12a", "invalid"),
            chat.replace("2026-10-03T12:00:00.000Z", "invalid"),
            "{\"type\":\"reply_ready\",\"id\":\"23dfc96c-984a-4358-9fa7-12fd71ace12a\"}")
            .forEach { text -> assertTrue("Should reject $text", runCatching { decodeServerMessage(text) }.isFailure) }
    }
    @Test fun encodesReplyWithChannelContext() {
        val reply = Reply("3a3425a2-28cd-4a9b-bef6-2e9bc0e05583", "Hello", channel = "Local")
        val encoded = encodeReply(reply)
        assertTrue(encoded.contains("\"channel\":\"Local\""))
        assertEquals("reply", Json.parseToJsonElement(encoded).jsonObject["type"]?.jsonPrimitive?.content)
        assertEquals(reply, Json.decodeFromString<Reply>(encoded))
    }
    @Test fun replyWithoutChannelStillIncludesTypeAndOmitsNullChannel() {
        val encoded = Json.parseToJsonElement(encodeReply(Reply("3a3425a2-28cd-4a9b-bef6-2e9bc0e05583", "test"))).jsonObject
        assertEquals("reply", encoded["type"]?.jsonPrimitive?.content)
        assertFalse(encoded.containsKey("channel"))
    }
    @Test fun readsClipboardFailureAndSourceStatus() {
        val result = decodeServerMessage("""{"type":"reply_ready","id":"3a3425a2-28cd-4a9b-bef6-2e9bc0e05583","original":"Hello","translated":"Hello","copiedToClipboard":false}""")
        assertEquals(false, result.copiedToClipboard)
        assertEquals("source_waiting", decodeServerMessage("""{"type":"status","status":"source_waiting","message":"Waiting for game"}""").status)
    }
}
