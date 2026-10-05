package com.catemup.meowlingo

import com.catemup.meowlingo.domain.ChatEntry
import com.catemup.meowlingo.domain.mergeChatHistory
import org.junit.Assert.*
import org.junit.Test

class ChatHistoryTest {
    private fun entry(id: String, minute: String) = ChatEntry(id, "Server", "Announcement", channel = "Server", timestamp = "2026-10-05T10:$minute:00Z", unread = true)

    @Test fun replayIsMergedChronologicallyAndDoesNotBecomeUnread() {
        val recent = entry("recent", "29")
        val merged = mergeChatHistory(listOf(recent), entry("old", "13"), true)
        assertEquals(listOf("old", "recent"), merged.entries.map { it.id })
        assertTrue(merged.historical)
        assertFalse(merged.entries.first().unread)
    }

    @Test fun changedDesktopIdUpdatesExistingEntryAndPreservesUiState() {
        val existing = entry("old-id", "13").copy(explanation = "Saved explanation", unread = false)
        val merged = mergeChatHistory(listOf(existing), existing.copy(id = "new-id", translated = "Updated translation"), true)
        assertFalse(merged.added)
        assertEquals(1, merged.entries.size)
        assertEquals("old-id", merged.entries.single().id)
        assertEquals("new-id", merged.entries.single().serverId)
        assertEquals("Saved explanation", merged.entries.single().explanation)
        assertEquals("Updated translation", merged.entries.single().translated)
    }

    @Test fun repeatedTextAtDifferentTimesIsKeptAndLiveMessagesStayUnread() {
        val merged = mergeChatHistory(listOf(entry("first", "13")), entry("second", "29"), false)
        assertEquals(2, merged.entries.size)
        assertFalse(merged.historical)
        assertTrue(merged.entries.last().unread)
        val updated = mergeChatHistory(merged.entries, entry("second", "29").copy(translated = "Translation"), false)
        assertFalse(updated.added)
        assertEquals(2, updated.entries.size)
    }
}
