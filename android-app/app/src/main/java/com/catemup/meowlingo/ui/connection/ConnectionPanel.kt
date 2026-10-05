package com.catemup.meowlingo.ui.connection

import com.catemup.meowlingo.config.uiText
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.toggleable
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.unit.dp
import com.catemup.meowlingo.data.ChatState
import com.catemup.meowlingo.domain.DesktopEndpoint

@Composable
fun ConnectionPanel(state: ChatState, onAddress: (String) -> Unit, onConnect: () -> Unit,
    onDisconnect: () -> Unit, onEnableNotifications: () -> Unit, onFindDesktop: () -> Unit,
    onNativeLanguage: (String) -> Unit, onChatLanguage: (String) -> Unit,
    onTheme: (String) -> Unit,
    onChannelColor: (String, String) -> Unit,
    onNotificationChannel: (String) -> Unit,
    onAutoConnect: (Boolean) -> Unit, onSelectDesktop: (DesktopEndpoint) -> Unit) {
    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp).padding(bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("MeowLingo v${com.catemup.meowlingo.BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.headlineSmall)
        Text(uiText("Changes are saved automatically. Configure OpenAI on your desktop."),
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        SettingsLanguagePicker("Native language", state.targetLanguage, onNativeLanguage)
        Text(uiText("Sets the app language and the translation language for incoming messages."), style = MaterialTheme.typography.bodySmall)
        SettingsLanguagePicker("Chat language", state.chatLanguage, onChatLanguage)
        Text(uiText("Your replies are translated into this language before being sent to the game."), style = MaterialTheme.typography.bodySmall)
        Text(uiText("Theme"), style = MaterialTheme.typography.titleMedium)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("light" to "Light", "dark" to "Dark", "system" to "Device theme").forEach { (value, label) ->
                FilterChip(selected = state.theme == value, onClick = { onTheme(value) }, label = { Text(uiText(label)) })
            }
        }
        HorizontalDivider()
        Text(uiText("Notifications"), style = MaterialTheme.typography.headlineSmall)
        Text(uiText("Choose channels to receive notifications when the app is in the background."),
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        val notificationChannels = (com.catemup.meowlingo.config.AppSettings.channelColors.keys + state.notificationChannels + state.entries.map { it.channel }).distinct()
        notificationChannels.forEach { channel ->
            val subscribed = channel in state.notificationChannels
            Row(Modifier.fillMaxWidth().toggleable(value = subscribed, role = Role.Checkbox,
                onValueChange = { onNotificationChannel(channel) }).padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically) {
                Checkbox(checked = subscribed, onCheckedChange = null)
                val originalName = com.catemup.meowlingo.data.channelCommand(channel).removePrefix("/").lowercase(java.util.Locale.ROOT)
                Text("${uiText(channel)} ($originalName)", modifier = Modifier.padding(start = 12.dp))
            }
        }
        TextButton(onClick = onEnableNotifications) { Text(uiText("Enable / manage notifications")) }
        HorizontalDivider()
        ChannelColorSettings(state.channelColors, onChannelColor)
        HorizontalDivider()
        Text(uiText("Desktop connection"), style = MaterialTheme.typography.headlineSmall)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(uiText("Auto-connect"), style = MaterialTheme.typography.titleMedium)
                Text(uiText("Find MeowLingo on your local network"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Switch(checked = state.autoConnect, onCheckedChange = onAutoConnect)
        }
        Text(uiText(if (state.autoConnectPaused) "Auto-connect paused. Search again to resume." else state.discoveryStatus),
            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedButton(onClick = onFindDesktop) { Text(uiText("Search for desktop")) }
        if (state.desktops.size > 1) Text(uiText("Choose your desktop below. Your choice will be remembered."), style = MaterialTheme.typography.bodySmall)
        state.desktops.forEach { desktop ->
            OutlinedCard(Modifier.fillMaxWidth()) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(desktop.name, style = MaterialTheme.typography.titleSmall)
                        Text(desktop.address, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    TextButton(onClick = { onSelectDesktop(desktop) }) {
                        Text(uiText(if (state.connectedDesktopId == desktop.id && state.status == "Connected") "Reconnect" else "Connect"))
                    }
                }
            }
        }
        HorizontalDivider()
        Text(uiText("USB cable"), style = MaterialTheme.typography.titleSmall)
        Text(uiText("Connect your phone with USB debugging enabled, then run node launch.mjs usb on your computer. No Wi-Fi is required."),
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        HorizontalDivider()
        Text(uiText("Manual connection"), style = MaterialTheme.typography.titleSmall)
        Text(uiText("Use a manual address if your router blocks network discovery. Both devices must be on the same network."),
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedTextField(value = state.address, onValueChange = onAddress, label = { Text(uiText("WebSocket address")) },
            placeholder = { Text("ws://192.168.1.42:8765") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(onClick = onConnect) { Text(uiText(if (state.status == "Disconnected") "Connect" else "Reconnect")) }
            OutlinedButton(onClick = onDisconnect, enabled = state.status != "Disconnected") { Text(uiText("Disconnect")) }
        }
        HorizontalDivider()
        Text("${uiText(state.status)} · ${uiText(state.sourceStatus)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(uiText("Replies are copied to your desktop clipboard. Paste them into the game with Cmd/Ctrl+V."),
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun SettingsLanguagePicker(label: String, code: String, onSelect: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    val languages = com.catemup.meowlingo.config.translationLanguages
    val flags = com.catemup.meowlingo.config.languageFlags
    val uiLanguage = com.catemup.meowlingo.config.LocalUiLanguage.current
    val pickerLabel = uiText(label)
    val currentName = java.util.Locale.forLanguageTag(code).getDisplayLanguage(java.util.Locale.forLanguageTag(uiLanguage))
    Text(pickerLabel, style = MaterialTheme.typography.titleMedium)
    Box {
        OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth().semantics { contentDescription = "$pickerLabel: $currentName" }) {
            Text(flags[code].orEmpty(), style = MaterialTheme.typography.titleLarge)
            Icon(androidx.compose.material.icons.Icons.Default.ArrowDropDown, null)
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }, modifier = Modifier.heightIn(max = 360.dp)) {
            languages.forEach { (language, _) ->
                val name = java.util.Locale.forLanguageTag(language).getDisplayLanguage(java.util.Locale.forLanguageTag(uiLanguage))
                DropdownMenuItem(text = { Text(flags[language].orEmpty(), style = MaterialTheme.typography.titleLarge) },
                    modifier = Modifier.semantics { contentDescription = name; selected = language == code },
                    onClick = { onSelect(language); expanded = false })
            }
        }
    }
}
