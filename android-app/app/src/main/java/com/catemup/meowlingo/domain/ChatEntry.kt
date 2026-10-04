package com.catemup.meowlingo.domain

import java.time.Instant

data class ChatEntry(
    val id: String,
    val author: String,
    val original: String,
    val translated: String? = null,
    val outgoing: Boolean = false,
    val delivery: String = "",
    val channel: String = "General",
    val timestamp: String = Instant.now().toString(),
    val unread: Boolean = false,
)
