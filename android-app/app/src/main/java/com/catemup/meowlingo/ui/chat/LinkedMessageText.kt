package com.catemup.meowlingo.ui.chat

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.style.TextDecoration

@Composable
fun LinkedMessageText(text: String) {
    val linkColor = MaterialTheme.colorScheme.primary
    val annotated = buildAnnotatedString {
        append(text)
        Regex("(?:https?://|www\\.|discord\\.gg/)[^\\s<>]+", RegexOption.IGNORE_CASE).findAll(text).forEach { match ->
            val value = match.value.trimEnd('.', ',', ';', '!', '?', ')', ']', '}')
            if (value.isNotEmpty()) addLink(LinkAnnotation.Url(
                if (value.startsWith("http", true)) value else "https://$value",
                TextLinkStyles(style = SpanStyle(color = linkColor, textDecoration = TextDecoration.Underline))),
                match.range.first, match.range.first + value.length)
        }
    }
    Text(annotated, style = MaterialTheme.typography.bodyMedium)
}
