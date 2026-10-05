package com.catemup.meowlingo.config

// Other supported translation languages currently use the English interface.
fun appLanguage(nativeLanguage: String): String = if (nativeLanguage == "uk") "uk" else "en"
