package com.catemup.meowlingo.domain

import java.time.Instant

data class HistoryMerge(val entries: List<ChatEntry>, val added: Boolean, val historical: Boolean)

fun mergeChatHistory(entries: List<ChatEntry>, incoming: ChatEntry, replayed: Boolean): HistoryMerge {
    fun time(entry: ChatEntry): Instant = runCatching { Instant.parse(entry.timestamp) }.getOrDefault(Instant.EPOCH)
    val incomingTime = time(incoming)
    val index = entries.indexOfFirst { existing ->
        !existing.outgoing && (existing.id == incoming.id || existing.serverId == incoming.id ||
            (time(existing) == incomingTime && existing.author == incoming.author &&
                existing.channel == incoming.channel && existing.original == incoming.original))
    }
    if (index >= 0) {
        val updated = entries.toMutableList()
        // Keep the local ID and UI state, but use the current desktop ID for explanation requests.
        updated[index] = updated[index].copy(translated = incoming.translated ?: updated[index].translated, serverId = incoming.id)
        return HistoryMerge(updated.sortedBy(::time), added = false, historical = true)
    }
    val historical = replayed || entries.any { time(it) > incomingTime }
    val entry = incoming.copy(serverId = incoming.id, unread = incoming.unread && !historical)
    return HistoryMerge((entries + entry).sortedBy(::time), added = true, historical = historical)
}
