package com.catemup.meowlingo.data.websocket

import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import com.catemup.meowlingo.data.ChatSession
import com.catemup.meowlingo.notifications.ChatNotifications
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map

class ChatConnectionService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private lateinit var session: ChatSession
    private lateinit var notifications: ChatNotifications
    override fun onCreate() {
        super.onCreate()
        session = ChatSession.get(this)
        notifications = ChatNotifications(this)
        val notification = notifications.connection("Connecting")
        if (Build.VERSION.SDK_INT >= 34) startForeground(ChatNotifications.CONNECTION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING)
        else startForeground(ChatNotifications.CONNECTION_ID, notification)
        scope.launch {
            session.state.map { it.status }.distinctUntilChanged().collect { status ->
                val manager = getSystemService(android.app.NotificationManager::class.java)
                if (manager.areNotificationsEnabled()) manager.notify(ChatNotifications.CONNECTION_ID, notifications.connection(status))
            }
        }
    }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == "disconnect") { session.pauseAutoConnect(); session.disconnect(); stopSelf(); return START_NOT_STICKY }
        intent?.getStringExtra("address")?.let { session.connect(it, intent.getStringExtra("desktopId")) }
        return START_NOT_STICKY
    }
    override fun onDestroy() {
        session.disconnect(); scope.cancel(); stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }
    override fun onBind(intent: Intent?): IBinder? = null
}
