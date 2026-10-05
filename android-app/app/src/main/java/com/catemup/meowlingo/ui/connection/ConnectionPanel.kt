package com.catemup.meowlingo.ui.connection

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.unit.dp
import com.catemup.meowlingo.data.ChatState
import com.catemup.meowlingo.domain.DesktopEndpoint

@Composable
fun ConnectionPanel(state: ChatState, onAddress: (String) -> Unit, onConnect: () -> Unit,
    onDisconnect: () -> Unit, onEnableNotifications: () -> Unit, onFindDesktop: () -> Unit,
    onTheme: (String) -> Unit,
    onChannelColor: (String, String) -> Unit,
    onAutoConnect: (Boolean) -> Unit, onSelectDesktop: (DesktopEndpoint) -> Unit) {
    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp).padding(bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("App settings", style = MaterialTheme.typography.headlineSmall)
        Text("Changes are saved automatically in this app's private config.json. Configure OpenAI on your desktop.",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("Theme", style = MaterialTheme.typography.titleMedium)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("light" to "Light", "dark" to "Dark", "system" to "Device theme").forEach { (value, label) ->
                FilterChip(selected = state.theme == value, onClick = { onTheme(value) }, label = { Text(label) })
            }
        }
        ChannelColorSettings(state.channelColors, onChannelColor)
        HorizontalDivider()
        Text("Desktop connection", style = MaterialTheme.typography.headlineSmall)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Auto-connect", style = MaterialTheme.typography.titleMedium)
                Text("Find MeowLingo on your local network", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Switch(checked = state.autoConnect, onCheckedChange = onAutoConnect)
        }
        Text(if (state.autoConnectPaused) "Auto-connect paused. Search again to resume." else state.discoveryStatus,
            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedButton(onClick = onFindDesktop) { Text("Search for desktop") }
        if (state.desktops.size > 1) Text("Choose your desktop below. Your choice will be remembered.", style = MaterialTheme.typography.bodySmall)
        state.desktops.forEach { desktop ->
            OutlinedCard(Modifier.fillMaxWidth()) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(desktop.name, style = MaterialTheme.typography.titleSmall)
                        Text(desktop.address, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    TextButton(onClick = { onSelectDesktop(desktop) }) {
                        Text(if (state.connectedDesktopId == desktop.id && state.status == "Connected") "Reconnect" else "Connect")
                    }
                }
            }
        }
        HorizontalDivider()
        Text("USB cable", style = MaterialTheme.typography.titleSmall)
        Text("Connect your phone with USB debugging enabled, then run node launch.mjs usb on your computer. No Wi-Fi is required.",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        HorizontalDivider()
        Text("Manual connection", style = MaterialTheme.typography.titleSmall)
        Text("Use a manual address if your router blocks network discovery. Both devices must be on the same network.",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedTextField(value = state.address, onValueChange = onAddress, label = { Text("WebSocket address") },
            placeholder = { Text("ws://192.168.1.42:8765") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(onClick = onConnect) { Text(if (state.status == "Disconnected") "Connect" else "Reconnect") }
            OutlinedButton(onClick = onDisconnect, enabled = state.status != "Disconnected") { Text("Disconnect") }
        }
        HorizontalDivider()
        Text("${state.status} · ${state.sourceStatus}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        TextButton(onClick = onEnableNotifications) { Text("Enable / manage notifications") }
        Text("Replies are copied to your desktop clipboard. Paste them into the game with Cmd/Ctrl+V.",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
