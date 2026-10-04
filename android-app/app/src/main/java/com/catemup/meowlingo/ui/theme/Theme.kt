package com.catemup.meowlingo.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Light = lightColorScheme(
    primary = Color(0xFF5468D4), onPrimary = Color.White,
    primaryContainer = Color(0xFFE5E9FF), onPrimaryContainer = Color(0xFF263374),
    secondary = Color(0xFF347B6B), secondaryContainer = Color(0xFFDAF4EB),
    onSecondaryContainer = Color(0xFF174C40),
    background = Color(0xFFF5F6FB), surface = Color(0xFFFDFDFF),
    surfaceVariant = Color(0xFFEAEDF5), onSurfaceVariant = Color(0xFF677084),
    outlineVariant = Color(0xFFDDE1EC),
)
private val Dark = darkColorScheme(
    primary = Color(0xFFB8C3FF), onPrimary = Color(0xFF243374),
    primaryContainer = Color(0xFF344382), onPrimaryContainer = Color(0xFFE2E7FF),
    secondary = Color(0xFF8DD9BE), secondaryContainer = Color(0xFF234C43),
    onSecondaryContainer = Color(0xFFB8F5DF),
    background = Color(0xFF11151F), surface = Color(0xFF1B2030),
    surfaceVariant = Color(0xFF292F40), onSurfaceVariant = Color(0xFFADB5CA),
    outlineVariant = Color(0xFF373F53),
)
@Composable
fun MeowLingoTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (isSystemInDarkTheme()) Dark else Light, content = content)
}
