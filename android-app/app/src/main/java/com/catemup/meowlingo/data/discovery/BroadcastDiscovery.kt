package com.catemup.meowlingo.data.discovery

import com.catemup.meowlingo.domain.DesktopEndpoint
import com.catemup.meowlingo.domain.desktopWebSocketAddress
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.Inet4Address
import java.net.InetAddress
import java.net.NetworkInterface
import kotlinx.coroutines.*
import org.json.JSONObject

/** Provides discovery when the router does not forward mDNS. */
class BroadcastDiscovery(private val onDesktop: (DesktopEndpoint) -> Unit) {
    private var job: Job? = null
    @Volatile private var socket: DatagramSocket? = null

    fun start() {
        stop()
        job = CoroutineScope(Dispatchers.IO).launch {
            val currentSocket = DatagramSocket()
            socket = currentSocket
            try {
                currentSocket.broadcast = true
                currentSocket.soTimeout = 500
                val request = "MEOWLINGO_DISCOVER_V1".toByteArray(Charsets.UTF_8)
                while (isActive) {
                    val addresses = runCatching {
                        NetworkInterface.getNetworkInterfaces().toList().filter { it.isUp && !it.isLoopback }
                            .flatMap { it.interfaceAddresses }.mapNotNull { it.broadcast }
                    }.getOrDefault(emptyList()) + InetAddress.getByName("255.255.255.255")
                    addresses.distinct().forEach { address ->
                        runCatching { currentSocket.send(DatagramPacket(request, request.size, address, 8766)) }
                    }
                    val deadline = System.nanoTime() + 3_000_000_000L
                    while (isActive && System.nanoTime() < deadline) {
                        val packet = DatagramPacket(ByteArray(2048), 2048)
                        try { currentSocket.receive(packet) } catch (_: java.net.SocketTimeoutException) { continue }
                        if (packet.address !is Inet4Address || packet.address.isLoopbackAddress || packet.address.isAnyLocalAddress) continue
                        runCatching {
                            val message = JSONObject(String(packet.data, 0, packet.length, Charsets.UTF_8))
                            val id = message.getString("id")
                            val port = message.getInt("port")
                            val name = message.getString("name")
                            if (message.optString("app") == "meowlingo" && message.optString("version") == "1" &&
                                id.matches(Regex("[a-f0-9]{24}")) && port in 1..65535 && name.isNotBlank()) {
                                onDesktop(DesktopEndpoint(id, name.removePrefix("MeowLingo-"), desktopWebSocketAddress(packet.address.hostAddress!!, port)))
                            }
                        }
                    }
                }
            } catch (failure: Exception) {
                if (failure is CancellationException) throw failure
            } finally {
                currentSocket.close()
                if (socket === currentSocket) socket = null
            }
        }
    }

    fun stop() { job?.cancel(); job = null; socket?.close(); socket = null }
}
