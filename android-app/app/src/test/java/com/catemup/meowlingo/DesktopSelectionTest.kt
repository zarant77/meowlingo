package com.catemup.meowlingo

import com.catemup.meowlingo.domain.DesktopEndpoint
import com.catemup.meowlingo.domain.usbWebSocketAddress
import com.catemup.meowlingo.domain.desktopWebSocketAddress
import com.catemup.meowlingo.domain.selectAutomaticDesktop
import org.junit.Assert.*
import org.junit.Test

class DesktopSelectionTest {
    private val first = DesktopEndpoint("first", "My desktop", "ws://192.168.1.42:8765")
    private val second = DesktopEndpoint("second", "Another desktop", "ws://192.168.1.43:8765")
    @Test fun connectsToSingleDesktop() { assertEquals(first, selectAutomaticDesktop(listOf(first), null)) }
    @Test fun doesNotPickArbitraryDesktopWhenSeveralAreAvailable() {
        assertNull(selectAutomaticDesktop(listOf(first, second), null))
        assertNull(selectAutomaticDesktop(listOf(first, second), "missing"))
    }
    @Test fun prefersRememberedDesktop() { assertEquals(second, selectAutomaticDesktop(listOf(first, second), "second")) }
    @Test fun noDesktopMeansNoConnection() { assertNull(selectAutomaticDesktop(emptyList(), "first")) }
    @Test fun usbUsesLoopbackAndValidatesPort() {
        assertEquals("ws://127.0.0.1:8765", usbWebSocketAddress(8765))
        assertEquals("ws://127.0.0.1:9000", usbWebSocketAddress(9000))
        assertTrue(runCatching { usbWebSocketAddress(0) }.isFailure)
        assertTrue(runCatching { usbWebSocketAddress(65536) }.isFailure)
    }
    @Test fun supportsCustomPortsAndIpv6Brackets() {
        assertEquals("ws://192.168.1.42:9000", desktopWebSocketAddress("192.168.1.42", 9000))
        assertEquals("ws://[2001:db8::1]:8765", desktopWebSocketAddress("2001:db8::1", 8765))
        assertTrue(runCatching { desktopWebSocketAddress("", 8765) }.isFailure)
        assertTrue(runCatching { desktopWebSocketAddress("192.168.1.42", 0) }.isFailure)
    }
}
