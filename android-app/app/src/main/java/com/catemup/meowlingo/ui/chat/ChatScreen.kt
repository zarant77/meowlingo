package com.catemup.meowlingo.ui.chat

import com.catemup.meowlingo.config.LocalChannelColors
import com.catemup.meowlingo.config.channelBackground
import com.catemup.meowlingo.config.channelForeground
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.ui.semantics.Role
import com.catemup.meowlingo.data.replyChannels
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.catemup.meowlingo.domain.ChatEntry
import com.catemup.meowlingo.ui.connection.ConnectionPanel
import com.catemup.meowlingo.viewmodel.ChatViewModel
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(model: ChatViewModel, onEnableNotifications: () -> Unit, onRequestNotifications: () -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    var draft by rememberSaveable { mutableStateOf("") }
    var settings by rememberSaveable { mutableStateOf(false) }
    var showSearch by rememberSaveable { mutableStateOf(false) }
    val list = rememberLazyListState()
    val scope = rememberCoroutineScope()
    val channels = remember(state.entries) { (replyChannels + state.entries.map { it.channel }).distinct().sorted() }
    val visible = remember(state.entries, state.hiddenChannels, state.search) {
        state.entries.filter { entry ->
            (entry.channel !in state.hiddenChannels) &&
                (state.search.isBlank() || listOf(entry.author, entry.original, entry.translated.orEmpty()).any { it.contains(state.search, true) })
        }
    }
    val atBottom by remember { derivedStateOf { list.firstVisibleItemIndex == 0 && list.firstVisibleItemScrollOffset < 80 } }
    var followLatest by remember { mutableStateOf(true) }
    LaunchedEffect(list) {
        snapshotFlow { list.firstVisibleItemIndex == 0 && list.firstVisibleItemScrollOffset < 80 }
            .distinctUntilChanged().collect { followLatest = it; model.atBottom(it) }
    }
    LaunchedEffect(visible.firstOrNull()?.id, visible.lastOrNull()?.id) {
        if (followLatest && visible.isNotEmpty()) list.animateScrollToItem(0)
    }
    LaunchedEffect(state.hiddenChannels, state.search) { list.scrollToItem(0); model.atBottom(true) }
    val unread = visible.count { it.unread }
    CompositionLocalProvider(LocalChannelColors provides state.channelColors) {
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.systemBars.union(WindowInsets.displayCutout)).imePadding()) {
            Surface(color = MaterialTheme.colorScheme.surface) {
                Column {
                    Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 10.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(44.dp).background(MaterialTheme.colorScheme.primaryContainer, RoundedCornerShape(16.dp)), contentAlignment = Alignment.Center) {
                            Text("M", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        }
                        Column(Modifier.weight(1f).padding(start = 12.dp)) {
                            Text("MeowLingo", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Box(Modifier.size(7.dp).background(if (state.status == "Connected") Color(0xFF39AF86) else MaterialTheme.colorScheme.outline, CircleShape))
                                Text(if (state.status == "Connected") when (state.sourceState) {
                                    "source_watching" -> "Game chat · live"
                                    "source_error" -> "Log reader needs attention"
                                    else -> "Connected · waiting for game"
                                } else state.status, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        IconButton(onClick = { showSearch = !showSearch; if (!showSearch) model.search("") }) { Icon(Icons.Default.Search, "Search messages") }
                        IconButton(onClick = { settings = true }) { Icon(Icons.Default.Settings, "Connection settings") }
                    }
                    if (showSearch) OutlinedTextField(value = state.search, onValueChange = model::search,
                        placeholder = { Text("Search messages or players") }, singleLine = true,
                        shape = RoundedCornerShape(16.dp), leadingIcon = { Icon(Icons.Default.Search, null) },
                        trailingIcon = { IconButton(onClick = { model.search(""); showSearch = false }) { Icon(Icons.Default.Close, "Close search") } },
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 8.dp))
                    LazyRow(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(channels) { channel ->
                            ChannelChip(channel, channel !in state.hiddenChannels, state.entries.count { it.channel == channel && it.unread }) { model.toggleChannel(channel) }
                        }
                    }
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                }
            }
            state.error?.let { error ->
                Surface(color = MaterialTheme.colorScheme.errorContainer) {
                    Row(Modifier.fillMaxWidth().padding(start = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(error, color = MaterialTheme.colorScheme.onErrorContainer, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                        IconButton(onClick = model::dismissError) { Icon(Icons.Default.Close, "Dismiss error") }
                    }
                }
            }
            Box(Modifier.weight(1f).fillMaxWidth()) {
                if (visible.isEmpty()) Column(Modifier.align(Alignment.Center).padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Surface(shape = CircleShape, color = MaterialTheme.colorScheme.primaryContainer) {
                        Icon(Icons.Default.Email, null, Modifier.padding(20.dp).size(32.dp), tint = MaterialTheme.colorScheme.primary)
                    }
                    Text(if (state.search.isNotBlank()) "No matching messages" else "Your game chat, here", style = MaterialTheme.typography.titleMedium)
                    Text(if (state.status == "Connected") "Waiting for new messages from Project Zomboid." else if (state.autoConnect && !state.autoConnectPaused) state.discoveryStatus else "Connect to your desktop to follow the conversation.",
                        style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (state.status == "Disconnected") {
                        if (state.desktops.size > 1) Button(onClick = { settings = true }) { Text("Choose desktop") }
                        else TextButton(onClick = { settings = true }) { Text("Connection settings") }
                    }
                }
                LazyColumn(Modifier.fillMaxSize(), state = list, reverseLayout = true, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    items(visible.asReversed(), key = { it.id }) { entry -> MessageBubble(entry, onExplain = { model.explain(entry.id) }, onWhisper = { model.selectWhisperRecipient(entry.author) }) }
                }
                if (!atBottom && visible.isNotEmpty()) FilledTonalButton(onClick = { scope.launch { list.animateScrollToItem(0); model.atBottom(true) } },
                    modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 12.dp)) {
                    Text(if (unread > 0) "$unread new messages ↓" else "Latest messages ↓")
                }
            }
            Surface(color = MaterialTheme.colorScheme.surface, shadowElevation = 6.dp) {
                Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp)) {
                    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(value = draft, onValueChange = { if (it.length <= 4000) draft = it },
                            placeholder = { Text("Write a reply…") }, shape = RoundedCornerShape(24.dp), modifier = Modifier.weight(1f), maxLines = 5)
                        ChannelSendButton(state.replyChannel, state.status == "Connected" && draft.isNotBlank(),
                            onSelect = model::selectReplyChannel, lastRecipient = state.whisperRecipient, onRecipient = model::selectWhisperRecipient,
                            onSend = { recipient -> if (model.send(draft, recipient)) { draft = ""; scope.launch { list.animateScrollToItem(0) } } })
                    }
                    Text("${com.catemup.meowlingo.data.channelCommand(state.replyChannel)}${if (state.replyChannel == "Whisper" && state.whisperRecipient.isNotBlank()) " → ${state.whisperRecipient}" else ""} · hold Send to choose channel", style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 14.dp, top = 6.dp))
                }
            }
        }
    }
    if (settings) ModalBottomSheet(onDismissRequest = { settings = false }) {
        ConnectionPanel(state, model::address,
            onConnect = { if (model.connect()) { settings = false; onRequestNotifications() } },
            onDisconnect = model::disconnect, onEnableNotifications = onEnableNotifications,
            onChannelColor = model::setChannelColor,
            onFindDesktop = model::findDesktop, onAutoConnect = model::setAutoConnect,
            onSelectDesktop = { if (model.connectToDesktop(it)) { settings = false; onRequestNotifications() } })
    }
    }
}

@Composable
private fun ChannelChip(name: String, selected: Boolean, unread: Int, onClick: () -> Unit) {
    val background = channelBackground(name)
    val foreground = channelForeground(name)
    val borderWidth = with(LocalDensity.current) { 1f.toDp() }
    Surface(color = if (selected) background else MaterialTheme.colorScheme.surface,
        contentColor = if (selected) foreground else MaterialTheme.colorScheme.onSurfaceVariant,
        border = BorderStroke(borderWidth, Color.White),
        shape = RoundedCornerShape(16.dp)) {
        Row(Modifier.toggleable(value = selected, role = Role.Button, onValueChange = { onClick() })
            .heightIn(min = 40.dp).padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(name)
            if (unread > 0 && selected) Badge { Text(if (unread > 99) "99+" else unread.toString()) }
        }
    }
}

@Composable
private fun MessageBubble(entry: ChatEntry, onExplain: () -> Unit, onWhisper: () -> Unit) {
    var showExplanation by rememberSaveable(entry.id) { mutableStateOf(false) }
    var showOriginal by rememberSaveable(entry.id) { mutableStateOf(false) }
    val time = remember(entry.timestamp) { runCatching {
        DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.systemDefault()).format(Instant.parse(entry.timestamp))
    }.getOrDefault("") }
    val different = entry.translated != null && entry.translated != entry.original
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (entry.outgoing) Arrangement.End else Arrangement.Start, verticalAlignment = Alignment.Bottom) {
        Surface(modifier = Modifier.widthIn(max = 320.dp).weight(1f, fill = false).combinedClickable(
            enabled = !entry.outgoing, onClick = {}, onLongClick = onWhisper, onLongClickLabel = "Whisper to ${entry.author}"),
            shape = RoundedCornerShape(10.dp),
            color = channelBackground(entry.channel), contentColor = channelForeground(entry.channel),
            tonalElevation = 0.dp) {
            Column(Modifier.padding(horizontal = 8.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(if (entry.outgoing) "You" else entry.author, style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    Text(time, style = MaterialTheme.typography.labelSmall, color = channelForeground(entry.channel).copy(alpha = 0.7f))
                }
                LinkedMessageText(if (showOriginal) entry.original else entry.translated ?: entry.original)
                if (!entry.outgoing && showExplanation) {
                    HorizontalDivider(modifier = Modifier.padding(top = 6.dp),
                        color = channelForeground(entry.channel).copy(alpha = 0.25f))
                    Column(Modifier.padding(vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        when {
                            entry.explanationLoading -> Text("Explaining context…", style = MaterialTheme.typography.bodySmall)
                            entry.explanation != null -> Text(entry.explanation, style = MaterialTheme.typography.bodySmall)
                            entry.explanationError != null -> {
                                Text(entry.explanationError, style = MaterialTheme.typography.bodySmall)
                                Text("Retry", modifier = Modifier.clickable { onExplain() }.padding(vertical = 4.dp))
                            }
                        }
                    }
                    HorizontalDivider(color = channelForeground(entry.channel).copy(alpha = 0.25f))
                }
                if (different || !entry.outgoing || entry.delivery.isNotBlank()) {
                    Row(Modifier.fillMaxWidth().padding(top = 2.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (different) {
                            Text(if (showOriginal) "Show translate" else "Show original",
                                style = MaterialTheme.typography.labelSmall,
                                color = channelForeground(entry.channel).copy(alpha = 0.8f),
                                modifier = Modifier.clickable { showOriginal = !showOriginal }.padding(vertical = 6.dp))
                        }
                        Spacer(Modifier.weight(1f))
                        if (!entry.outgoing) {
                            Text("?", style = MaterialTheme.typography.titleMedium,
                                modifier = Modifier.sizeIn(minWidth = 32.dp, minHeight = 32.dp)
                                    .clickable { showExplanation = !showExplanation; if (showExplanation) onExplain() }
                                    .padding(horizontal = 10.dp, vertical = 4.dp))
                        }
                    }
                    if (entry.outgoing && entry.delivery.isNotBlank()) {
                        Row(Modifier.align(Alignment.End), verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                            if (entry.delivery == "Copied to PC") Icon(Icons.Default.Check, null,
                                Modifier.size(14.dp), tint = channelForeground(entry.channel))
                            Text(entry.delivery, style = MaterialTheme.typography.labelSmall,
                                color = channelForeground(entry.channel).copy(alpha = 0.7f))
                        }
                    }
                }
            }
        }
    }
}
