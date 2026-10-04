package com.catemup.meowlingo.domain

data class DesktopEndpoint(val id: String, val name: String, val address: String)

fun selectAutomaticDesktop(desktops: List<DesktopEndpoint>, preferredId: String?): DesktopEndpoint? {
    return desktops.firstOrNull { it.id == preferredId } ?: desktops.singleOrNull()
}

fun desktopWebSocketAddress(host: String, port: Int): String {
    require(host.isNotBlank() && port in 1..65535)
    return "ws://${if (host.contains(':')) "[$host]" else host}:$port"
}

fun usbWebSocketAddress(port: Int): String {
    require(port in 1..65535) { "Invalid USB connection port" }
    return desktopWebSocketAddress("127.0.0.1", port)
}
