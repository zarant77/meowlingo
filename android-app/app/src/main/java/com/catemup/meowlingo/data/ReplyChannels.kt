package com.catemup.meowlingo.data

val replyChannels = listOf("General", "Local", "Yell", "Faction", "Safehouse", "Whisper")
fun channelCommand(channel: String): String = mapOf("General" to "/all", "Local" to "/say", "Yell" to "/yell", "Faction" to "/faction", "Safehouse" to "/safehouse", "Whisper" to "/whisper")[channel] ?: channel
