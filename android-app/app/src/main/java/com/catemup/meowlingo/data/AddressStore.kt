package com.catemup.meowlingo.data

import android.content.Context
import android.util.AtomicFile
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

private val Context.legacySettings by preferencesDataStore(name = "connection")

class AddressStore(private val context: Context) {
    private val file = AtomicFile(File(context.filesDir, "config.json"))
    private val mutex = Mutex()

    private fun write(settings: JSONObject) {
        val output = file.startWrite()
        try {
            output.write((settings.toString(2) + "\n").toByteArray(Charsets.UTF_8))
            file.finishWrite(output)
        } catch (failure: Exception) {
            file.failWrite(output)
            throw failure
        }
    }

    private suspend fun load(): JSONObject {
        val defaults = JSONObject(context.assets.open("config.defaults.json").bufferedReader().use { it.readText() })
        if (file.baseFile.exists()) {
            val saved = JSONObject(file.openRead().bufferedReader().use { it.readText() })
            saved.keys().forEach { defaults.put(it, saved.get(it)) }
            return defaults
        }
        // Migrate existing installations without losing connection or channel preferences.
        val old = context.legacySettings.data.first()
        old[stringPreferencesKey("address")]?.let { defaults.put("address", it) }
        old[booleanPreferencesKey("auto_connect")]?.let { defaults.put("autoConnect", it) }
        old[stringPreferencesKey("preferred_desktop")]?.let { defaults.put("preferredDesktop", it) }
        old[stringPreferencesKey("whisper_recipient")]?.let { defaults.put("whisperRecipient", it) }
        old[stringSetPreferencesKey("muted_channels")]?.let { defaults.put("hiddenChannels", JSONArray(it.toList())) }
        val colors = JSONObject()
        old[stringSetPreferencesKey("channel_colors")]?.forEach {
            val parts = it.split("=", limit = 2)
            if (parts.size == 2) colors.put(parts[0], parts[1])
        }
        defaults.put("channelColors", colors)
        write(defaults)
        return defaults
    }

    private suspend fun <T> readValue(read: (JSONObject) -> T): T =
        withContext(Dispatchers.IO) { mutex.withLock { read(load()) } }

    private suspend fun saveValue(key: String, value: Any) {
        withContext(Dispatchers.IO) { mutex.withLock {
            val settings = load()
            settings.put(key, value)
            write(settings)
        } }
    }

    suspend fun readChatLanguage(): String = readValue {
        it.optString("chatLanguage", "en").takeIf { language -> language in com.catemup.meowlingo.config.translationLanguages } ?: "en"
    }
    suspend fun saveChatLanguage(language: String) = saveValue("chatLanguage", language)
    suspend fun readTargetLanguage(): String = readValue {
        it.optString("targetLanguage", "uk").takeIf { language -> language in com.catemup.meowlingo.config.translationLanguages } ?: "uk"
    }
    suspend fun saveTargetLanguage(language: String) = saveValue("targetLanguage", language)
    suspend fun readTheme(): String = readValue {
        it.optString("theme", "system").takeIf { theme -> theme in setOf("system", "light", "dark") } ?: "system"
    }
    suspend fun saveTheme(theme: String) = saveValue("theme", theme)
    suspend fun readChannelColors(): Map<String, String> = readValue { settings ->
        val colors = settings.getJSONObject("channelColors")
        colors.keys().asSequence().mapNotNull { channel ->
            val color = colors.optString(channel)
            if (com.catemup.meowlingo.config.isChannelColor(color)) channel to color else null
        }.toMap()
    }
    suspend fun saveChannelColors(values: Map<String, String>) = saveValue("channelColors", JSONObject(values))
    suspend fun readWhisperRecipient(): String = readValue { it.getString("whisperRecipient") }
    suspend fun saveWhisperRecipient(recipient: String) = saveValue("whisperRecipient", recipient)
    suspend fun readPreferredDesktop(): String? = readValue { if (it.isNull("preferredDesktop")) null else it.getString("preferredDesktop") }
    suspend fun readAutoConnect(): Boolean = readValue { it.getBoolean("autoConnect") }
    suspend fun savePreferredDesktop(id: String) = saveValue("preferredDesktop", id)
    suspend fun saveAutoConnect(enabled: Boolean) = saveValue("autoConnect", enabled)
    suspend fun readMuted(): Set<String> = readValue { settings ->
        val channels = settings.getJSONArray("hiddenChannels")
        (0 until channels.length()).map { channels.getString(it) }.toSet()
    }
    suspend fun saveMuted(channels: Set<String>) = saveValue("hiddenChannels", JSONArray(channels.toList()))
    suspend fun read(): String = readValue { it.getString("address") }
    suspend fun save(address: String) = saveValue("address", address)
}
