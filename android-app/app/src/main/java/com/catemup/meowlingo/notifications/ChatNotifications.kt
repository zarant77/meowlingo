package com.catemup.meowlingo.notifications

import android.Manifest
import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import com.catemup.meowlingo.MainActivity
import com.catemup.meowlingo.R
import com.catemup.meowlingo.data.websocket.ChatConnectionService
import com.catemup.meowlingo.domain.ChatEntry

class ChatNotifications(private val context: Context) {
    private val manager = context.getSystemService(NotificationManager::class.java)
    private val recent = ArrayDeque<ChatEntry>()
    init {
        manager.createNotificationChannel(NotificationChannel(CONNECTION, "Desktop connection", NotificationManager.IMPORTANCE_LOW))
        manager.createNotificationChannel(NotificationChannel(MESSAGES, "Chat messages", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "New Project Zomboid messages while MeowLingo is in the background"
        })
    }
    private fun open(channel: String? = null): PendingIntent = PendingIntent.getActivity(context, if (channel == null) 0 else 2,
        Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            channel?.let { putExtra("channel", it) }
        }, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    fun connection(status: String): Notification {
        val disconnect = PendingIntent.getService(context, 1,
            Intent(context, ChatConnectionService::class.java).setAction("disconnect"),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        return Notification.Builder(context, CONNECTION)
            .setSmallIcon(R.drawable.ic_notification).setContentTitle("MeowLingo · $status")
            .setContentText("Listening for game chat · tap to open")
            .setContentIntent(open()).setOngoing(true).setOnlyAlertOnce(true)
            .addAction(Notification.Action.Builder(null, "Disconnect", disconnect).build()).build()
    }
    @Suppress("DEPRECATION")
    fun message(entry: ChatEntry) {
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        recent.addLast(entry)
        while (recent.size > 5) recent.removeFirst()
        val style = Notification.MessagingStyle("You").setConversationTitle("Project Zomboid")
        recent.forEach { message ->
            style.addMessage(Notification.MessagingStyle.Message(message.translated ?: message.original,
                runCatching { java.time.Instant.parse(message.timestamp).toEpochMilli() }.getOrDefault(System.currentTimeMillis()),
                "${message.author} · ${message.channel}"))
        }
        manager.notify(MESSAGE_ID, Notification.Builder(context, MESSAGES)
            .setSmallIcon(R.drawable.ic_notification).setContentTitle("${entry.author} · ${entry.channel}")
            .setContentText(entry.translated ?: entry.original).setStyle(style)
            .setContentIntent(open(entry.channel)).setVisibility(Notification.VISIBILITY_PRIVATE).setAutoCancel(true).setCategory(Notification.CATEGORY_MESSAGE).build())
    }
    fun clearMessages() { recent.clear(); manager.cancel(MESSAGE_ID) }
    companion object {
        const val CONNECTION = "desktop_connection"
        const val MESSAGES = "chat_messages"
        const val CONNECTION_ID = 1
        const val MESSAGE_ID = 2
    }
}
