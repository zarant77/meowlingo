package com.catemup.meowlingo

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.SystemBarStyle
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.catemup.meowlingo.ui.theme.LocalDarkTheme
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import com.catemup.meowlingo.data.ChatSession
import com.catemup.meowlingo.viewmodel.ChatViewModel
import com.catemup.meowlingo.ui.chat.ChatScreen
import com.catemup.meowlingo.ui.theme.MeowLingoTheme

class MainActivity : ComponentActivity() {
    private val model: ChatViewModel by viewModels()
    private val permission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        intent.getStringExtra("channel")?.let { ChatSession.get(this).selectChannel(it) }
        setContent {
            val state by model.state.collectAsStateWithLifecycle()
            MeowLingoTheme(state.theme) {
                val dark = LocalDarkTheme.current
                SideEffect {
                    val style = if (dark) SystemBarStyle.dark(android.graphics.Color.TRANSPARENT)
                        else SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT)
                    enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
                }
                ChatScreen(model, onEnableNotifications = ::enableNotifications, onRequestNotifications = ::requestNotifications)
            }
        }
    }
    private fun requestNotifications() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            permission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
    private fun enableNotifications() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            permission.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            startActivity(Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, packageName))
        }
    }
    private fun handleLauncherIntent() {
        if (intent.getBooleanExtra("meowlingo.disconnect", false)) {
            intent.removeExtra("meowlingo.disconnect")
            intent.removeExtra("meowlingo.usbPort")
            model.disconnect()
        } else if (intent.hasExtra("meowlingo.usbPort")) {
            val port = intent.getIntExtra("meowlingo.usbPort", -1)
            intent.removeExtra("meowlingo.usbPort")
            if (model.connectUsb(port)) requestNotifications()
        }
    }
    override fun onStart() {
        super.onStart()
        ChatSession.get(this).visible(true)
        handleLauncherIntent()
        model.startDiscovery(::requestNotifications)
    }
    override fun onResume() { super.onResume(); handleLauncherIntent() }
    override fun onStop() { model.stopDiscovery(); ChatSession.get(this).visible(false); super.onStop() }
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (lifecycle.currentState.isAtLeast(androidx.lifecycle.Lifecycle.State.STARTED)) handleLauncherIntent()
        intent.getStringExtra("channel")?.let { ChatSession.get(this).selectChannel(it) }
    }
}
