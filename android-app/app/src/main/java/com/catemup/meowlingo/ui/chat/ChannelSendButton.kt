package com.catemup.meowlingo.ui.chat

import androidx.compose.foundation.border
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import androidx.compose.ui.window.PopupPositionProvider
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.geometry.Offset
import kotlin.math.roundToInt
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import com.catemup.meowlingo.config.channelForeground
import com.catemup.meowlingo.config.channelBackground
import com.catemup.meowlingo.data.channelCommand
import com.catemup.meowlingo.data.replyChannels

@Composable
fun ChannelSendButton(channel: String, enabled: Boolean, onSelect: (String) -> Unit, lastRecipient: String, onRecipient: (String) -> Unit, onSend: (String?) -> Unit) {
    var menu by remember { mutableStateOf(false) }
    var hovered by remember { mutableStateOf<String?>(null) }
    var whisperDialog by remember { mutableStateOf(false) }
    var recipient by rememberSaveableRecipient()
    var buttonPosition by remember { mutableStateOf(Offset.Zero) }
    val density = LocalDensity.current
    val menuWidth = with(density) { 180.dp.toPx() }
    val buttonWidth = with(density) { 56.dp.toPx() }
    LaunchedEffect(lastRecipient) { recipient = lastRecipient }
    val rowPixels = with(LocalDensity.current) { 44.dp.toPx() }
    val selectLatest by rememberUpdatedState(onSelect)
    val sendLatest by rememberUpdatedState(onSend)
    val channelLatest by rememberUpdatedState(channel)
    val canSendLatest by rememberUpdatedState(enabled)
    fun submit(selected: String) {
        selectLatest(selected)
        if (!canSendLatest) return
        if (selected == "Whisper") whisperDialog = true else sendLatest(null)
    }
    Box(Modifier.size(56.dp).onGloballyPositioned { buttonPosition = it.positionInWindow() }.pointerInput(Unit) {
        detectDragGesturesAfterLongPress(
            onDragStart = { menu = true; hovered = channelLatest },
            onDrag = { change, _ ->
                change.consume()
                val index = ((change.position.y + rowPixels * replyChannels.size) / rowPixels).toInt()
                hovered = if (change.position.y < 0 && change.position.x >= (-124).dp.toPx() && change.position.x < 56.dp.toPx()) replyChannels.getOrNull(index) else null
            },
            onDragEnd = { val target = hovered; menu = false; hovered = null; if (target != null) submit(target) },
            onDragCancel = { menu = false; hovered = null },
        )

    }) {
        if (menu) Popup(
            popupPositionProvider = object : PopupPositionProvider {
                override fun calculatePosition(anchorBounds: IntRect, windowSize: IntSize, layoutDirection: LayoutDirection, popupContentSize: IntSize): IntOffset =
                    IntOffset((buttonPosition.x + buttonWidth - menuWidth).roundToInt(),
                        (buttonPosition.y - rowPixels * replyChannels.size).roundToInt())
            },
            properties = PopupProperties(focusable = false, clippingEnabled = false),
        ) {
            Surface(modifier = Modifier.width(180.dp).height((44 * replyChannels.size).dp),
                shape = RoundedCornerShape(12.dp), shadowElevation = 12.dp) {
                Column {
                    replyChannels.forEach { target ->
                        androidx.compose.runtime.CompositionLocalProvider(androidx.compose.material3.LocalContentColor provides channelForeground(target)) {
                        Box(Modifier.fillMaxWidth().height(44.dp).background(channelBackground(target)), contentAlignment = Alignment.CenterStart) {
                            Text((if (hovered == target) "→ " else "   ") + channelCommand(target), modifier = Modifier.padding(horizontal = 12.dp))
                        }
                        }
                    }
                }
            }
        }
        val channelColor = channelBackground(channel)
        FilledIconButton(onClick = { submit(channelLatest) }, enabled = enabled,
            colors = IconButtonDefaults.filledIconButtonColors(
                containerColor = channelColor,
                contentColor = channelForeground(channel),
                disabledContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                disabledContentColor = MaterialTheme.colorScheme.onSurfaceVariant),
            modifier = Modifier.size(56.dp).then(
                if (!enabled) Modifier.border(2.dp, MaterialTheme.colorScheme.outline, CircleShape)
                    .border(1.dp, channelColor, CircleShape)
                else Modifier.border(1.dp, MaterialTheme.colorScheme.outline, CircleShape))) { Icon(Icons.AutoMirrored.Filled.Send, "Send; hold and slide to choose a channel") }
    }
    if (whisperDialog) AlertDialog(onDismissRequest = { whisperDialog = false }, title = { Text("Private message") },
        text = { OutlinedTextField(recipient, { recipient = it }, label = { Text("Recipient nickname") }, singleLine = true) },
        confirmButton = { TextButton(enabled = recipient.isNotBlank() && recipient.none { it == '"' || it == '\n' || it == '\r' },
            onClick = { whisperDialog = false; onRecipient(recipient.trim()); if (canSendLatest) sendLatest(recipient.trim()) }) { Text("Send whisper") } },
        dismissButton = { TextButton(onClick = { whisperDialog = false }) { Text("Cancel") } })
}

@Composable
private fun rememberSaveableRecipient() = androidx.compose.runtime.saveable.rememberSaveable { mutableStateOf("") }
