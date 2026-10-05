package com.catemup.meowlingo.data

import android.content.Context
import com.catemup.meowlingo.data.model.Reply
import com.catemup.meowlingo.data.model.ServerMessage
import com.catemup.meowlingo.data.websocket.ChatSocket
import com.catemup.meowlingo.domain.mergeChatHistory
import com.catemup.meowlingo.domain.ChatEntry
import com.catemup.meowlingo.domain.DesktopEndpoint
import com.catemup.meowlingo.notifications.ChatNotifications
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import java.net.URI
import java.util.UUID

data class ChatState(
    val address: String = "ws://10.0.2.2:8765",
    val status: String = "Disconnected",
    val desktops: List<DesktopEndpoint> = emptyList(),
    val discoveryStatus: String = "Looking for desktops on your network…",
    val autoConnect: Boolean = true,
    val autoConnectPaused: Boolean = false,
    val discoveryPreferencesReady: Boolean = false,
    val preferredDesktopId: String? = null,
    val connectedDesktopId: String? = null,
    val connectionAddress: String? = null,
    val sourceState: String = "source_waiting",
    val sourceStatus: String = "Waiting for desktop",
    val entries: List<ChatEntry> = emptyList(),
    val historyLimit: Int = 10,
    val whisperRecipient: String = "",
    val replyChannel: String = "Local",
    val search: String = "",
    val theme: String = "system",
    val channelColors: Map<String, String> = emptyMap(),
    val hiddenChannels: Set<String> = emptySet(),
    val error: String? = null,
)

class ChatSession private constructor(context: Context) {
    private val store = AddressStore(context.applicationContext)
    private val socket = ChatSocket()
    private val notifications = ChatNotifications(context.applicationContext)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val mutable = MutableStateFlow(ChatState())
    val state = mutable.asStateFlow()
    private var reconnect: Job? = null
    private var desiredAddress: String? = null
    private var editedAddress = false
    private var editedMutes = false
    private var editedDiscovery = false
    private var autoSaveJob: Job? = null
    private var muteJob: Job? = null
    private var generation = 0
    private var visible = false
    private var retrySeconds = 2L
    private var entriesAtBottom = true
    private var saveJob: Job? = null
    private var editedWhisperRecipient = false
    private var editedTheme = false
    private var themeSaveJob: Job? = null
    fun setTheme(theme: String) {
        if (theme !in setOf("system", "light", "dark")) return
        editedTheme = true
        mutable.update { it.copy(theme = theme) }
        themeSaveJob?.cancel()
        themeSaveJob = scope.launch {
            try { store.saveTheme(theme) }
            catch (failure: Exception) { if (failure is CancellationException) throw failure; error("Could not save theme") }
        }
    }
    private var editedColors = false
    private var colorSaveJob: Job? = null
    fun setChannelColor(channel: String, color: String) {
        if (color.isNotEmpty() && !com.catemup.meowlingo.config.isChannelColor(color)) return
        editedColors = true
        mutable.update { it.copy(channelColors = if (color.isEmpty()) it.channelColors - channel else it.channelColors + (channel to color.uppercase())) }
        val colors = state.value.channelColors
        colorSaveJob?.cancel()
        colorSaveJob = scope.launch {
            try { store.saveChannelColors(colors) }
            catch (failure: Exception) { if (failure is CancellationException) throw failure; error("Could not save channel colors") }
        }
    }
    init {
        scope.launch {
            try { val theme = store.readTheme(); if (!editedTheme) mutable.update { it.copy(theme = theme) } }
            catch (failure: Exception) { if (failure is CancellationException) throw failure; error("Could not load theme") }
        }
        scope.launch {
            try { val colors = store.readChannelColors(); if (!editedColors) mutable.update { it.copy(channelColors = colors) } }
            catch (failure: Exception) { if (failure is CancellationException) throw failure; error("Could not load channel colors") }
        }
        scope.launch {
            try { val saved = store.readWhisperRecipient(); if (!editedWhisperRecipient) mutable.update { it.copy(whisperRecipient = saved) } }
            catch (failure: Exception) { if (failure is CancellationException) throw failure; error("Could not load whisper recipient") }
        }
        scope.launch {
            try { val saved = store.read(); if (!editedAddress) mutable.update { it.copy(address = saved) } }
            catch (failure: Exception) { if (failure is CancellationException) throw failure; error("Could not read saved address") }
        }
        scope.launch {
            try { val muted = store.readMuted(); if (!editedMutes) mutable.update { it.copy(hiddenChannels = muted) } }
            catch (failure: Exception) { if (failure is CancellationException) throw failure; error("Could not read notification preferences") }
        }
        scope.launch {
            try {
                val preferred = store.readPreferredDesktop()
                val enabled = store.readAutoConnect()
                if (!editedDiscovery) mutable.update { it.copy(preferredDesktopId = preferred, autoConnect = enabled) }
            } catch (failure: Exception) { if (failure is CancellationException) throw failure; error("Could not read auto-connect preferences") }
            finally { mutable.update { it.copy(discoveryPreferencesReady = true) } }
        }
    }
    fun discovered(desktops: List<DesktopEndpoint>) { mutable.update { it.copy(desktops = desktops) } }
    fun discoveryStatus(value: String) { mutable.update { it.copy(discoveryStatus = value) } }
    fun pauseAutoConnect() { mutable.update { it.copy(autoConnectPaused = true) } }
    fun resumeAutoConnect() { mutable.update { it.copy(autoConnectPaused = false) } }
    fun setAutoConnect(enabled: Boolean) {
        editedDiscovery = true
        mutable.update { it.copy(autoConnect = enabled, autoConnectPaused = false) }
        autoSaveJob?.cancel()
        autoSaveJob = scope.launch { try { store.saveAutoConnect(enabled) } catch (failure: Exception) { if (failure is CancellationException) throw failure; error("Could not save auto-connect preference") } }
    }
    fun error(message: String?) { mutable.update { it.copy(error = message) } }
    fun address(value: String) { editedAddress = true; mutable.update { it.copy(address = value) } }
    fun validatedAddress(): String? {
        val address = state.value.address.trim()
        val valid = runCatching { URI(address).let {
            it.scheme in listOf("ws", "wss") && !it.host.isNullOrBlank() && it.userInfo == null &&
                it.fragment == null && (it.port == -1 || it.port in 1..65535)
        } }.getOrDefault(false)
        if (!valid) { error("Enter a valid ws://host:port address"); return null }
        return address
    }
    fun connect(address: String, desktopId: String? = null) {
        editedAddress = true
        if (desktopId != null) {
            editedDiscovery = true
            mutable.update { it.copy(preferredDesktopId = desktopId) }
            scope.launch { try { store.savePreferredDesktop(desktopId) } catch (failure: Exception) { if (failure is CancellationException) throw failure; error("Could not save preferred desktop") } }
        }
        mutable.update { it.copy(address = address, connectionAddress = address, connectedDesktopId = desktopId) }
        reconnect?.cancel()
        markPendingUnknown()
        desiredAddress = address
        retrySeconds = 2
        saveJob?.cancel()
        saveJob = scope.launch { try { store.save(address) } catch (failure: Exception) { if (failure is CancellationException) throw failure; error("Could not save address") } }
        open(address)
    }
    private fun open(address: String) {
        val token = ++generation
        mutable.update { it.copy(status = "Connecting", error = null) }
        socket.connect(address,
            onStatus = { status -> scope.launch {
                if (token != generation) return@launch
                mutable.update { it.copy(status = status) }
                if (status == "Connected") retrySeconds = 2
                if (status == "Disconnected") mutable.update { current -> current.copy(entries = current.entries.map {
                    if (it.explanationLoading) it.copy(explanationLoading = false, explanationError = "Disconnected. Please try again.") else it
                }) }
                if (status == "Disconnected" && desiredAddress != null) {
                    markPendingUnknown()
                    mutable.update { it.copy(status = "Reconnecting", sourceState = "source_waiting", sourceStatus = "Waiting for desktop") }
                    reconnect?.cancel()
                    reconnect = scope.launch {
                        delay(retrySeconds * 1000)
                        retrySeconds = (retrySeconds * 2).coerceAtMost(30)
                        desiredAddress?.let { open(it) }
                    }
                }
            } },
            onMessage = { message -> scope.launch { if (token == generation) receive(message) } },
            onError = { message -> scope.launch { if (token == generation) error(message) } },
        )
    }
    private fun markPendingUnknown() {
        mutable.update { current -> current.copy(entries = current.entries.map {
            if (it.delivery == "Pending") it.copy(delivery = "Delivery unknown · check PC clipboard") else it
        }) }
    }
    fun disconnect() {
        generation++; desiredAddress = null; reconnect?.cancel(); socket.disconnect()
        markPendingUnknown()
        mutable.update { it.copy(entries = it.entries.map { entry -> if (entry.explanationLoading) entry.copy(explanationLoading = false, explanationError = "Disconnected. Please try again.") else entry }, status = "Disconnected", connectionAddress = null, connectedDesktopId = null, sourceState = "source_waiting", sourceStatus = "Waiting for desktop") }
    }
    fun selectWhisperRecipient(recipient: String) {
        val name = recipient.trim()
        if (name.isBlank() || name.length > 100 || name.any { it == '"' || it == '\n' || it == '\r' }) return
        editedWhisperRecipient = true
        mutable.update { it.copy(whisperRecipient = name, replyChannel = "Whisper") }
        scope.launch {
            try { store.saveWhisperRecipient(name) }
            catch (failure: Exception) { if (failure is CancellationException) throw failure; error("Could not save whisper recipient") }
        }
    }
    fun selectReplyChannel(channel: String) { if (channel in replyChannels) mutable.update { it.copy(replyChannel = channel) } }
    fun selectChannel(channel: String?) { if (channel != null && channel in state.value.hiddenChannels) toggleChannel(channel); markVisibleRead() }
    fun search(value: String) { mutable.update { it.copy(search = value) }; markVisibleRead() }
    fun toggleChannel(channel: String) {
        editedMutes = true
        mutable.update { it.copy(hiddenChannels = if (channel in it.hiddenChannels) it.hiddenChannels - channel else it.hiddenChannels + channel) }
        val channels = state.value.hiddenChannels
        muteJob?.cancel()
        muteJob = scope.launch { try { store.saveMuted(channels) } catch (failure: Exception) { if (failure is CancellationException) throw failure; error("Could not save channel visibility") } }
    }
    fun visible(value: Boolean) {
        visible = value
        if (value) { notifications.clearMessages(); markVisibleRead() }
    }
    fun atBottom(value: Boolean) { entriesAtBottom = value; if (value) markVisibleRead() }
    private fun matches(entry: ChatEntry): Boolean {
        val current = state.value
        return (entry.channel !in current.hiddenChannels) &&
            (current.search.isBlank() || listOf(entry.author, entry.original, entry.translated.orEmpty()).any { it.contains(current.search, ignoreCase = true) })
    }
    private fun markVisibleRead() {
        if (!visible || !entriesAtBottom) return
        mutable.update { it.copy(entries = it.entries.map { entry -> if (entry.unread && matches(entry)) entry.copy(unread = false) else entry }) }
    }
    fun send(text: String, recipient: String? = null): Boolean {
        val trimmed = text.trim()
        if (trimmed.isEmpty() || trimmed.length > 4000 || state.value.status != "Connected") return false
        if (state.value.replyChannel == "Whisper" && (recipient.isNullOrBlank() || recipient.any { it == '"' || it == '\n' || it == '\r' })) return false
        val id = UUID.randomUUID().toString()
        val channel = state.value.replyChannel
        mutable.update { it.copy(entries = (it.entries + ChatEntry(id, "You", trimmed, outgoing = true, delivery = "Pending", channel = channel))) }
        if (!socket.send(Reply(id = id, text = trimmed, channel = channel, recipient = recipient))) {
            mutable.update { current -> current.copy(entries = current.entries.map { if (it.id == id) it.copy(delivery = "Send failed") else it }) }
            return false
        }
        return true
    }
    fun explain(id: String) {
        val entry = state.value.entries.find { it.id == id } ?: return
        if (entry.outgoing || entry.explanation != null || entry.explanationLoading) return
        val sent = state.value.status == "Connected" && socket.explain(entry.serverId ?: id)
        mutable.update { current -> current.copy(entries = current.entries.map {
            if (it.id == id) it.copy(explanationLoading = sent, explanationError = if (sent) null else "Connect to the desktop to explain context.") else it
        }) }
    }
    private fun receive(message: ServerMessage) {
        when (message.type) {
            "explanation" -> mutable.update { current -> current.copy(entries = current.entries.map {
                if (it.id == message.id || it.serverId == message.id) it.copy(explanation = message.explanation, explanationLoading = false, explanationError = message.error) else it
            }) }
            "chat" -> {
                val entry = ChatEntry(message.id!!, message.author!!, message.original!!, message.translated,
                    channel = message.channel ?: "General", timestamp = message.timestamp!!)
                val read = message.replayed || visible && entriesAtBottom && matches(entry)
                val merged = mergeChatHistory(state.value.entries, entry.copy(unread = !read), message.replayed)
                mutable.update { it.copy(entries = merged.entries) }
                if (merged.added && !merged.historical && !visible && entry.channel !in state.value.hiddenChannels) notifications.message(entry)

            }
            "status" -> if (message.status == "connected") mutable.update { it.copy(historyLimit = (message.historyLimit ?: 10).coerceIn(1, 500)) } else mutable.update { it.copy(sourceState = message.status.orEmpty(), sourceStatus = message.message.orEmpty()) }
            "reply_ready" -> mutable.update { current -> current.copy(entries = current.entries.map {
                if (it.id == message.id && it.outgoing) it.copy(translated = message.translated,
                    delivery = if (message.copiedToClipboard != true) "Clipboard copy failed"
                    else when (message.gameSendStatus) {
                        "keys_sent" -> "Keys sent to game"
                        "failed" -> "Copied to PC · input failed"
                        "not_focused" -> "Copied to PC · paste in Zomboid"
                        else -> "Copied to PC"
                    }) else it
            }) }
            "error" -> mutable.update { current -> current.copy(error = message.message, entries = current.entries.map {
                if (it.id == message.id && it.outgoing) it.copy(delivery = "Failed · ${message.message}") else it
            }) }
        }
    }
    companion object {
        @Volatile private var instance: ChatSession? = null
        fun get(context: Context): ChatSession = instance ?: synchronized(this) {
            instance ?: ChatSession(context).also { instance = it }
        }
    }
}
