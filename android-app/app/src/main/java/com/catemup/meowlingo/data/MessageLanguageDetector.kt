package com.catemup.meowlingo.data

import android.util.LruCache
import com.google.mlkit.nl.languageid.LanguageIdentification
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/** Identifies the displayed text locally, including original messages and translation fallbacks. */
object MessageLanguageDetector {
    private val identifier by lazy { LanguageIdentification.getClient() }
    private val cache = LruCache<String, String>(500)

    suspend fun identify(text: String): String? {
        if (text.isBlank()) return null
        val cached = cache.get(text)
        val language = cached ?: suspendCancellableCoroutine { continuation ->
            identifier.identifyLanguage(text)
                .addOnSuccessListener { code ->
                    cache.put(text, code)
                    if (continuation.isActive) continuation.resume(code)
                }
                .addOnFailureListener {
                    if (continuation.isActive) continuation.resume("und")
                }
        }
        return when (language) {
            "und" -> null
            "nb", "nn" -> "no"
            else -> language.substringBefore('-')
        }
    }
}
