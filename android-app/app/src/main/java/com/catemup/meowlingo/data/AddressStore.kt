package com.catemup.meowlingo.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first

private val Context.settings by preferencesDataStore(name = "connection")
class AddressStore(private val context: Context) {
    private val whisperRecipient = stringPreferencesKey("whisper_recipient")
    suspend fun readWhisperRecipient(): String = context.settings.data.first()[whisperRecipient] ?: ""
    suspend fun saveWhisperRecipient(recipient: String) { context.settings.edit { it[whisperRecipient] = recipient } }
    private val preferred = stringPreferencesKey("preferred_desktop")
    private val automatic = booleanPreferencesKey("auto_connect")
    suspend fun readPreferredDesktop(): String? = context.settings.data.first()[preferred]
    suspend fun readAutoConnect(): Boolean = context.settings.data.first()[automatic] ?: true
    suspend fun savePreferredDesktop(id: String) { context.settings.edit { it[preferred] = id } }
    suspend fun saveAutoConnect(enabled: Boolean) { context.settings.edit { it[automatic] = enabled } }
    private val muted = stringSetPreferencesKey("muted_channels")
    private val key = stringPreferencesKey("address")
    suspend fun readMuted(): Set<String> = context.settings.data.first()[muted] ?: emptySet()
    suspend fun saveMuted(channels: Set<String>) { context.settings.edit { it[muted] = channels } }
    suspend fun read(): String = context.settings.data.first()[key] ?: "ws://10.0.2.2:8765"
    suspend fun save(address: String) { context.settings.edit { it[key] = address } }
}
