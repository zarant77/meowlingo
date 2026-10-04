package com.catemup.meowlingo.data.discovery

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import java.net.Inet4Address
import android.os.Handler
import android.os.Looper
import com.catemup.meowlingo.domain.DesktopEndpoint
import com.catemup.meowlingo.domain.desktopWebSocketAddress

@Suppress("DEPRECATION")
class DesktopDiscovery(context: Context, private val onDesktops: (List<DesktopEndpoint>) -> Unit,
    private val onStatus: (String) -> Unit) {
    private val manager = context.getSystemService(NsdManager::class.java)
    private val wifi = context.applicationContext.getSystemService(WifiManager::class.java)
    private val handler = Handler(Looper.getMainLooper())
    private var listener: NsdManager.DiscoveryListener? = null
    private var multicast: WifiManager.MulticastLock? = null
    private var generation = 0
    private var resolving = false
    private val queued = ArrayDeque<NsdServiceInfo>()
    private val present = mutableSetOf<String>()
    private val found = linkedMapOf<String, DesktopEndpoint>()
    private var waitHint: Runnable? = null

    fun start() {
        stop()
        val token = generation
        fun current(action: () -> Unit) { handler.post { if (generation == token && listener != null) action() } }
        val discovery = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(type: String) = current {
                onStatus("Looking for desktops on your network…")
                waitHint = Runnable { if (generation == token && found.isEmpty()) onStatus("No desktop found yet. Start MeowLingo on your computer, or use a manual address.") }
                handler.postDelayed(waitHint!!, 10000)
            }
            override fun onServiceFound(service: NsdServiceInfo) = current {
                if (service.serviceType.trim('.').equals(SERVICE_TYPE.trim('.'), ignoreCase = true)) {
                    present.add(service.serviceName)
                    queued.removeAll { it.serviceName == service.serviceName }
                    queued.addLast(service)
                    resolveNext(token)
                }
            }
            override fun onServiceLost(service: NsdServiceInfo) = current {
                present.remove(service.serviceName)
                queued.removeAll { it.serviceName == service.serviceName }
                found.remove(service.serviceName)
                publish()
            }
            override fun onDiscoveryStopped(type: String) = current { onStatus("Discovery stopped") }
            override fun onStartDiscoveryFailed(type: String, code: Int) = current {
                stop()
                onStatus("Network discovery unavailable ($code). Use a manual address or try again.")
            }
            override fun onStopDiscoveryFailed(type: String, code: Int) { }
        }
        listener = discovery
        onDesktops(emptyList())
        try {
            multicast = wifi?.createMulticastLock("MeowLingoDiscovery")?.apply { setReferenceCounted(false); acquire() }
            manager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, discovery)
        } catch (error: Exception) {
            stop()
            onStatus("Network discovery unavailable: ${error.message ?: "unknown error"}. Use a manual address.")
        }
    }
    private fun publish() {
        onDesktops(found.values.distinctBy { it.id }.sortedBy { it.name })
        onStatus(if (found.isEmpty()) "Looking for desktops on your network…" else "${found.size} desktop${if (found.size == 1) "" else "s"} found nearby")
    }
    private fun resolveNext(token: Int) {
        if (generation != token || listener == null || resolving || queued.isEmpty()) return
        val service = queued.removeFirst()
        resolving = true
        fun finished(action: () -> Unit) {
            handler.post {
                if (generation != token || listener == null) return@post
                resolving = false
                action()
                resolveNext(token)
            }
        }
        try {
            manager.resolveService(service, object : NsdManager.ResolveListener {
                override fun onResolveFailed(info: NsdServiceInfo, code: Int) = finished {
                    if (present.contains(info.serviceName)) {
                        // Older NSD implementations allow only one active resolution; retry transient failures.
                        handler.postDelayed({
                            if (generation == token && listener != null && present.contains(info.serviceName) && !found.containsKey(info.serviceName)) {
                                queued.addLast(service); resolveNext(token)
                            }
                        }, 2000)
                    }
                }
                override fun onServiceResolved(info: NsdServiceInfo) = finished {
                    if (!present.contains(service.serviceName)) return@finished
                    val attributes = info.attributes
                    val app = attributes["app"]?.toString(Charsets.UTF_8)
                    val version = attributes["version"]?.toString(Charsets.UTF_8)
                    val id = attributes["id"]?.toString(Charsets.UTF_8)
                    val hosts = if (Build.VERSION.SDK_INT >= 34) info.hostAddresses else listOfNotNull(info.host)
                    val host = hosts.firstOrNull { it is Inet4Address && !it.isLoopbackAddress && !it.isAnyLocalAddress }
                    if (app != "meowlingo" || version != "1" || id == null || !id.matches(Regex("[a-f0-9]{24}")) ||
                        host == null || host.isLoopbackAddress || host.isAnyLocalAddress || info.port !in 1..65535) return@finished
                    val address = desktopWebSocketAddress(host.hostAddress ?: return@finished, info.port)
                    found[service.serviceName] = DesktopEndpoint(id, info.serviceName.removePrefix("MeowLingo-"), address)
                    publish()
                }
            })
        } catch (_: Exception) { resolving = false; resolveNext(token) }
    }
    fun stop() {
        generation++
        waitHint?.let(handler::removeCallbacks)
        waitHint = null
        val previous = listener
        listener = null
        if (previous != null) runCatching { manager.stopServiceDiscovery(previous) }
        multicast?.let { if (it.isHeld) it.release() }
        multicast = null
        queued.clear(); present.clear(); found.clear(); resolving = false
    }
    companion object { const val SERVICE_TYPE = "_meowlingo._tcp." }
}
