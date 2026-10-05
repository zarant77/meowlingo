package com.catemup.meowlingo.data

fun shouldNotify(channel: String, subscriptions: Set<String>, visible: Boolean, added: Boolean, historical: Boolean): Boolean =
    channel in subscriptions && !visible && added && !historical
