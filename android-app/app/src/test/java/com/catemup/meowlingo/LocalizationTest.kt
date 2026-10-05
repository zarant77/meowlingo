package com.catemup.meowlingo

import com.catemup.meowlingo.config.appLanguage
import com.catemup.meowlingo.config.translationLanguages
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Assert.*
import org.junit.Test

class LocalizationTest {
    @Test fun nativeLanguageSelectsInterfaceWithEnglishFallback() {
        assertEquals("uk", appLanguage("uk"))
        translationLanguages.keys.filter { it != "uk" }.forEach { assertEquals(it, "en", appLanguage(it)) }
        assertEquals("en", appLanguage("unknown"))
    }

    @Test fun ukrainianResourcesCoverAllEnglishStringsAndPreserveFormatArguments() {
        fun strings(folder: String): Map<String, String> {
            val document = DocumentBuilderFactory.newInstance().newDocumentBuilder()
                .parse(File("src/main/res/$folder/strings.xml"))
            val nodes = document.getElementsByTagName("string")
            return (0 until nodes.length).associate { index ->
                val node = nodes.item(index)
                node.attributes.getNamedItem("name").nodeValue to node.textContent.trim('"')
            }
        }
        val english = strings("values")
        val ukrainian = strings("values-uk")
        assertEquals(english.keys, ukrainian.keys)
        val formats = Regex("%[0-9]+\\\$[a-z]")
        english.forEach { (key, value) ->
            assertTrue(key, ukrainian.getValue(key).isNotBlank())
            assertEquals(key, formats.findAll(value).map { it.value }.toList(),
                formats.findAll(ukrainian.getValue(key)).map { it.value }.toList())
        }
        assertEquals("Рідна мова", ukrainian["ui_native_language"])
        assertEquals("Показати оригінал", ukrainian["ui_show_original"])
    }
}
