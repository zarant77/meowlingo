package com.catemup.meowlingo.viewmodel

import android.app.Application
import android.content.Intent
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.catemup.meowlingo.data.ChatSession
import com.catemup.meowlingo.data.discovery.DesktopDiscovery
import com.catemup.meowlingo.data.websocket.ChatConnectionService
import com.catemup.meowlingo.domain.DesktopEndpoint
import com.catemup.meowlingo.domain.usbWebSocketAddress
import com.catemup.meowlingo.domain.selectAutomaticDesktop
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map

class ChatViewModel(application: Application) : AndroidViewModel(application) {
    private val session = ChatSession.get(application)
    val state = session.state
    private var discoveryVisible = false
    private var automaticJob: Job? = null
    private var onAutoConnect: (() -> Unit)? = null
    private val discovery = DesktopDiscovery(application, session::discovered, session::discoveryStatus)
    init {
        viewModelScope.launch {
            state.map { listOf(it.desktops, it.autoConnect, it.autoConnectPaused, it.discoveryPreferencesReady, it.preferredDesktopId, it.status) }
                .distinctUntilChanged().collect { scheduleAutoConnect() }
        }
    }
    fun startDiscovery(onConnected: () -> Unit) {
        discoveryVisible = true; onAutoConnect = onConnected
        discovery.start()
        scheduleAutoConnect()
    }
    fun stopDiscovery() {
        discoveryVisible = false; onAutoConnect = null; automaticJob?.cancel(); discovery.stop()
    }
    fun findDesktop() {
        session.resumeAutoConnect(); session.setAutoConnect(true)
        if (discoveryVisible) discovery.start()
    }
    fun setAutoConnect(enabled: Boolean) { session.setAutoConnect(enabled) }
    private fun scheduleAutoConnect() {
        automaticJob?.cancel()
        if (!discoveryVisible) return
        automaticJob = viewModelScope.launch {
            // Wait briefly for all responders so multiple desktops can be handled together.
            delay(1500)
            val current = state.value
            if (!discoveryVisible || !current.discoveryPreferencesReady || !current.autoConnect || current.autoConnectPaused) return@launch
            if (current.status == "Connected") return@launch
            val desktop = selectAutomaticDesktop(current.desktops, current.preferredDesktopId) ?: return@launch
            if (current.status in listOf("Connecting", "Reconnecting")) {
                if (current.connectedDesktopId != desktop.id || current.connectionAddress == desktop.address) return@launch
            }
            if (connectToDesktop(desktop)) onAutoConnect?.invoke()
        }
    }
    fun address(value: String) { session.pauseAutoConnect(); session.address(value) }
    fun search(value: String) = session.search(value)
    fun selectChannel(channel: String?) = session.selectChannel(channel)
    fun setChatLanguage(language: String) = session.setChatLanguage(language)
    fun setTargetLanguage(language: String) = session.setTargetLanguage(language)
    fun setTheme(theme: String) = session.setTheme(theme)
    fun setChannelColor(channel: String, color: String) = session.setChannelColor(channel, color)
    fun toggleChannel(channel: String) = session.toggleChannel(channel)
    fun explain(id: String) = session.explain(id)
    fun dismissError() = session.error(null)
    fun atBottom(value: Boolean) = session.atBottom(value)
    fun selectWhisperRecipient(recipient: String) = session.selectWhisperRecipient(recipient)
    fun selectReplyChannel(channel: String) = session.selectReplyChannel(channel)
    fun send(text: String, recipient: String? = null): Boolean = session.send(text, recipient)
    private fun startConnection(address: String, desktopId: String? = null): Boolean {
        val context = getApplication<Application>()
        try {
            context.startForegroundService(Intent(context, ChatConnectionService::class.java)
                .putExtra("address", address).putExtra("desktopId", desktopId))
            return true
        } catch (error: Exception) { session.error(error.message ?: "Could not start connection service"); return false }
    }
    fun connectToDesktop(desktop: DesktopEndpoint): Boolean {
        session.resumeAutoConnect()
        return startConnection(desktop.address, desktop.id)
    }
    fun connectUsb(port: Int): Boolean {
        val address = runCatching { usbWebSocketAddress(port) }.getOrElse {
            session.error("Invalid USB connection port"); return false
        }
        session.pauseAutoConnect()
        automaticJob?.cancel()
        session.address(address)
        return startConnection(address)
    }
    fun connect(): Boolean {
        val address = session.validatedAddress() ?: return false
        session.pauseAutoConnect()
        return startConnection(address)
    }
    fun disconnect() {
        session.pauseAutoConnect(); automaticJob?.cancel(); session.disconnect()
        getApplication<Application>().stopService(Intent(getApplication(), ChatConnectionService::class.java))
    }
    override fun onCleared() { discovery.stop(); super.onCleared() }
}
