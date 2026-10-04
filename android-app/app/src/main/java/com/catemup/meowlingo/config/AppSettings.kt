package com.catemup.meowlingo.config

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Edit these channel colors to customize both message bubbles and channel buttons.
object AppSettings {
    data class ChannelColors(val light: Long, val dark: Long)
    val channelColors = mapOf(
        "All" to ChannelColors(0xFFE6E8ED, 0xFF303540),
        "General" to ChannelColors(0xFFDCEAFF, 0xFF203955),
        "Local" to ChannelColors(0xFFD7F2E3, 0xFF204737),
        "Faction" to ChannelColors(0xFFEBDFFF, 0xFF43305B),
        "Safehouse" to ChannelColors(0xFFFFE8C8, 0xFF554024),
        "Server" to ChannelColors(0xFFFFDDE0, 0xFF582D34),
        "Radio" to ChannelColors(0xFFD2F1F4, 0xFF24464C),
        "Yell" to ChannelColors(0xFFFFE0CC, 0xFF553426),
        "Whisper" to ChannelColors(0xFFF6DDF1, 0xFF502E49),
    )
}

@Composable
fun channelBackground(channel: String): Color {
    val dark = isSystemInDarkTheme()
    val configured = AppSettings.channelColors[channel]
    if (configured != null) return Color(if (dark) configured.dark else configured.light)
    // Unknown game channels get stable colors without requiring a configuration entry.
    val hue = Math.floorMod(channel.hashCode(), 360).toFloat()
    return Color.hsl(hue, 0.35f, if (dark) 0.23f else 0.89f)
}

@Composable
fun channelForeground(): Color = if (isSystemInDarkTheme()) Color(0xFFF4F5F8) else Color(0xFF18202B)
