package com.catemup.meowlingo.ui.connection

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.catemup.meowlingo.config.AppSettings
import com.catemup.meowlingo.config.channelBackground
import com.catemup.meowlingo.config.channelForeground
import com.catemup.meowlingo.config.isChannelColor
import com.catemup.meowlingo.data.channelCommand

@Composable
fun ChannelColorSettings(colors: Map<String, String>, onColor: (String, String) -> Unit) {
    Text("Channel colors", style = MaterialTheme.typography.headlineSmall)
    Text("Choose a background color using #RRGGBB. Applies to messages and channel buttons.",
        style = MaterialTheme.typography.bodySmall)
    AppSettings.channelColors.forEach { (channel, default) ->
        val current = colors[channel] ?: default
        var draft by remember(channel, current) { mutableStateOf(current) }
        Surface(color = channelBackground(channel), contentColor = channelForeground(channel),
            shape = MaterialTheme.shapes.small) {
            Text(channelCommand(channel), Modifier.padding(horizontal = 12.dp, vertical = 6.dp))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(value = draft, onValueChange = { draft = it.take(7) },
                label = { Text("Color") }, singleLine = true,
                isError = !isChannelColor(draft), modifier = Modifier.weight(1f))
            TextButton(onClick = { onColor(channel, draft) },
                enabled = isChannelColor(draft) && draft != current) { Text("Save") }
            TextButton(onClick = { draft = default; onColor(channel, "") }) { Text("Reset") }
        }
    }
}
