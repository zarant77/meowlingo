package com.catemup.meowlingo

import com.catemup.meowlingo.data.ChatState
import com.catemup.meowlingo.data.shouldNotify
import org.junit.Assert.*
import org.junit.Test

class NotificationSubscriptionsTest {
    @Test fun defaultSubscriptionsOnlyIncludeWhisper() {
        val subscriptions = ChatState().notificationChannels
        assertTrue(shouldNotify("Whisper", subscriptions, false, true, false))
        assertFalse(shouldNotify("General", subscriptions, false, true, false))
    }
    @Test fun selectedChannelsNotifyWithoutDuplicateOrHistoryAlerts() {
        val subscriptions = setOf("General", "Whisper")
        assertTrue(shouldNotify("General", subscriptions, false, true, false))
        assertFalse(shouldNotify("General", subscriptions, false, false, false))
        assertFalse(shouldNotify("General", subscriptions, false, true, true))
        assertFalse(shouldNotify("General", subscriptions, true, true, false))
        assertFalse(shouldNotify("General", emptySet(), false, true, false))
    }
    @Test fun hiddenChannelsDoNotChangeSubscriptions() {
        val state = ChatState(hiddenChannels = setOf("Whisper"))
        assertTrue(shouldNotify("Whisper", state.notificationChannels, false, true, false))
    }
}
