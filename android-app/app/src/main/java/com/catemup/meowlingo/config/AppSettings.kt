package com.catemup.meowlingo.config

import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance

object AppSettings {
    val channelColors = linkedMapOf(
        "Local" to "#FFFFFF",
        "General" to "#B45309",
        "Faction" to "#F472B6",
        "Safehouse" to "#14532D",
        "Yell" to "#DC2626",
        "Whisper" to "#7E22CE",
        "Server" to "#582D34",
        "Radio" to "#24464C",
    )
}

val LocalChannelColors = staticCompositionLocalOf<Map<String, String>> { emptyMap() }

fun isChannelColor(value: String): Boolean = Regex("#[0-9a-fA-F]{6}").matches(value)

@Composable
fun channelBackground(channel: String): Color {
    val hex = LocalChannelColors.current[channel] ?: AppSettings.channelColors[channel]
    if (hex != null && isChannelColor(hex)) return Color(0xFF000000 or hex.drop(1).toLong(16))
    return Color.hsl(Math.floorMod(channel.hashCode(), 360).toFloat(), 0.35f, 0.23f)
}

@Composable
fun channelForeground(channel: String): Color =
    if (channelBackground(channel).luminance() > 0.179f) Color.Black else Color.White
