package com.catemup.meowlingo.config

import android.content.Context
import android.content.res.Configuration
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
import com.catemup.meowlingo.R
import java.util.Locale

val LocalUiLanguage = staticCompositionLocalOf { "uk" }

fun localizedContext(context: Context, language: String): Context {
    val configuration = Configuration(context.resources.configuration)
    configuration.setLocale(Locale.forLanguageTag(appLanguage(language)))
    return context.createConfigurationContext(configuration)
}

private val uiResources = mapOf(
    "Notifications" to R.string.ui_notifications,
    "Choose channels to receive notifications when the app is in the background." to R.string.ui_notification_channel_hint,
    "Could not save notification channels" to R.string.ui_save_notification_channels,
    "Could not load notification channels" to R.string.ui_load_notification_channels,

    "%1\$s desktops found nearby" to R.string.ui_1_s_desktops_found_nearby,
    "Auto-connect paused. Search again to resume." to R.string.ui_auto_connect_paused_search_again_to_resume,
    "Cancel" to R.string.ui_cancel,
    "Changes are saved automatically. Configure OpenAI on your desktop." to R.string.ui_changes_are_saved_automatically_configure_openai_on_your_desktop,
    "Channel colors" to R.string.ui_channel_colors,
    "Chat language" to R.string.ui_chat_language,
    "Chat messages" to R.string.ui_chat_messages,
    "Choose a background color using #RRGGBB. Applies to messages and channel buttons." to R.string.ui_choose_a_background_color_using_rrggbb_applies_to_messages_and_channel_buttons,
    "Choose desktop" to R.string.ui_choose_desktop,
    "Choose your desktop below. Your choice will be remembered." to R.string.ui_choose_your_desktop_below_your_choice_will_be_remembered,
    "Clipboard copy failed" to R.string.ui_clipboard_copy_failed,
    "Close search" to R.string.ui_close_search,
    "Color" to R.string.ui_color,
    "Connect" to R.string.ui_connect,
    "Connect to the desktop to explain context." to R.string.ui_connect_to_the_desktop_to_explain_context,
    "Connect to your desktop to follow the conversation." to R.string.ui_connect_to_your_desktop_to_follow_the_conversation,
    "Connect your phone with USB debugging enabled, then run node launch.mjs usb on your computer. No Wi-Fi is required." to R.string.ui_connect_your_phone_with_usb_debugging_enabled_then_run_node_launch_mjs_usb_on_yo,
    "Connected" to R.string.ui_connected,
    "Connecting" to R.string.ui_connecting,
    "Connection settings" to R.string.ui_connection_settings,
    "Copied to PC" to R.string.ui_copied_to_pc,
    "Could not load channel colors" to R.string.ui_could_not_load_channel_colors,
    "Could not load chat language" to R.string.ui_could_not_load_chat_language,
    "Could not load theme" to R.string.ui_could_not_load_theme,
    "Could not load translation language" to R.string.ui_could_not_load_translation_language,
    "Could not load whisper recipient" to R.string.ui_could_not_load_whisper_recipient,
    "Could not read auto-connect preferences" to R.string.ui_could_not_read_auto_connect_preferences,
    "Could not read notification preferences" to R.string.ui_could_not_read_notification_preferences,
    "Could not read saved address" to R.string.ui_could_not_read_saved_address,
    "Could not save address" to R.string.ui_could_not_save_address,
    "Could not save auto-connect preference" to R.string.ui_could_not_save_auto_connect_preference,
    "Could not save channel colors" to R.string.ui_could_not_save_channel_colors,
    "Could not save channel visibility" to R.string.ui_could_not_save_channel_visibility,
    "Could not save chat language" to R.string.ui_could_not_save_chat_language,
    "Could not save preferred desktop" to R.string.ui_could_not_save_preferred_desktop,
    "Could not save theme" to R.string.ui_could_not_save_theme,
    "Could not save translation language" to R.string.ui_could_not_save_translation_language,
    "Could not save whisper recipient" to R.string.ui_could_not_save_whisper_recipient,
    "Dark" to R.string.ui_dark,
    "Delivery unknown · check PC clipboard" to R.string.ui_delivery_unknown_delivery_check_pc_clipboard,
    "Desktop connection" to R.string.ui_desktop_connection,
    "Device theme" to R.string.ui_device_theme,
    "Disconnect" to R.string.ui_disconnect,
    "Disconnected" to R.string.ui_disconnected,
    "Disconnected. Please try again." to R.string.ui_disconnected_please_try_again,
    "Discovery stopped" to R.string.ui_discovery_stopped,
    "Dismiss error" to R.string.ui_dismiss_error,
    "Enable / manage notifications" to R.string.ui_enable_manage_notifications,
    "Explaining context…" to R.string.ui_explaining_context,
    "Faction" to R.string.ui_faction,
    "Failed: %1\$s" to R.string.ui_failed_1_s,
    "Find MeowLingo on your local network" to R.string.ui_find_meowlingo_on_your_local_network,
    "General" to R.string.ui_general,
    "Invalid server message" to R.string.ui_invalid_server_message,
    "Latest messages ↓" to R.string.ui_latest_messages,
    "Light" to R.string.ui_light,
    "Listening for game chat · tap to open" to R.string.ui_listening_for_game_chat_delivery_tap_to_open,
    "Local" to R.string.ui_local,
    "Looking for desktops on your network…" to R.string.ui_looking_for_desktops_on_your_network,
    "Malformed server message ignored" to R.string.ui_malformed_server_message_ignored,
    "Manual connection" to R.string.ui_manual_connection,
    "Message language: %1\$s" to R.string.ui_message_language_1_s,
    "Native language" to R.string.ui_native_language,
    "Network error" to R.string.ui_network_error,
    "New Project Zomboid messages while MeowLingo is in the background" to R.string.ui_new_project_zomboid_messages_while_meowlingo_is_in_the_background,
    "New messages: %1\$s ↓" to R.string.ui_new_messages_1_s,
    "No desktop found yet. Start MeowLingo on your computer, or use a manual address." to R.string.ui_no_desktop_found_yet_start_meowlingo_on_your_computer_or_use_a_manual_address,
    "No matching messages" to R.string.ui_no_matching_messages,
    "Pending" to R.string.ui_pending,
    "Private message" to R.string.ui_private_message,
    "Recipient nickname" to R.string.ui_recipient_nickname,
    "Reconnect" to R.string.ui_reconnect,
    "Reconnecting" to R.string.ui_reconnecting,
    "Replies are copied to your desktop clipboard. Paste them into the game with Cmd/Ctrl+V." to R.string.ui_replies_are_copied_to_your_desktop_clipboard_paste_them_into_the_game_with_cmd_c,
    "Reset" to R.string.ui_reset,
    "Retry" to R.string.ui_retry,
    "Safehouse" to R.string.ui_safehouse,
    "Save" to R.string.ui_save,
    "Search for desktop" to R.string.ui_search_for_desktop,
    "Search messages" to R.string.ui_search_messages,
    "Search messages or players" to R.string.ui_search_messages_or_players,
    "Send failed" to R.string.ui_send_failed,
    "Send whisper" to R.string.ui_send_whisper,
    "Send; hold and slide to choose a channel" to R.string.ui_send_hold_and_slide_to_choose_a_channel,
    "Sets the app language and the translation language for incoming messages." to R.string.ui_sets_the_app_language_and_the_translation_language_for_incoming_messages,
    "Show original" to R.string.ui_show_original,
    "Show translate" to R.string.ui_show_translate,
    "Theme" to R.string.ui_theme,
    "Trying broadcast discovery…" to R.string.ui_trying_broadcast_discovery,
    "USB cable" to R.string.ui_usb_cable,
    "Unexpected binary message ignored" to R.string.ui_unexpected_binary_message_ignored,
    "Unsupported channel: %1\$s" to R.string.ui_unsupported_channel_1_s,
    "Use a manual address if your router blocks network discovery. Both devices must be on the same network." to R.string.ui_use_a_manual_address_if_your_router_blocks_network_discovery_both_devices_must_b,
    "Waiting for desktop" to R.string.ui_waiting_for_desktop,
    "Waiting for new messages from Project Zomboid." to R.string.ui_waiting_for_new_messages_from_project_zomboid,
    "WebSocket address" to R.string.ui_websocket_address,
    "Whisper" to R.string.ui_whisper,
    "Whisper to %1\$s" to R.string.ui_whisper_to_1_s,
    "Write a reply…" to R.string.ui_write_a_reply,
    "Yell" to R.string.ui_yell,
    "You" to R.string.ui_you,
    "Your game chat, here" to R.string.ui_your_game_chat_here,
    "Your replies are translated into this language before being sent to the game." to R.string.ui_your_replies_are_translated_into_this_language_before_being_sent_to_the_game,
    "Auto-connect" to R.string.ui_auto_connect,
    "Radio" to R.string.ui_radio,
    "Server" to R.string.ui_server,
    "Hold Send to choose channel" to R.string.ui_hold_send_to_choose_channel,
    "Enter a valid ws://host:port address" to R.string.ui_enter_a_valid_ws_host_port_address,
    "Invalid USB connection port" to R.string.ui_invalid_usb_connection_port,
    "Could not start connection service" to R.string.ui_could_not_start_connection_service,
    "Keys sent to game" to R.string.ui_keys_sent_to_game,
    "Copied to PC · input failed" to R.string.ui_copied_to_pc_delivery_input_failed,
    "Copied to PC · paste in Zomboid" to R.string.ui_copied_to_pc_delivery_paste_in_zomboid,
    "Mock chat input active" to R.string.ui_mock_chat_input_active,
    "Waiting for a Project Zomboid client chat log. Join a multiplayer game." to R.string.ui_waiting_for_a_project_zomboid_client_chat_log_join_a_multiplayer_game,
    "Could not start chat source." to R.string.ui_could_not_start_chat_source,
    "Context explanation is unavailable." to R.string.ui_context_explanation_is_unavailable,
    "This message is no longer available on the desktop." to R.string.ui_this_message_is_no_longer_available_on_the_desktop,
    "Context explanation failed. Please try again." to R.string.ui_context_explanation_failed_please_try_again,
    "Set your OpenAI API key in desktop Settings to explain context." to R.string.ui_set_your_openai_api_key_in_desktop_settings_to_explain_context,
    "Desktop found nearby" to R.string.ui_desktop_found_nearby,
    "Game chat · live" to R.string.ui_game_chat_delivery_live,
    "Connected · waiting for game" to R.string.ui_connected_delivery_waiting_for_game,
    "Log reader needs attention" to R.string.ui_log_reader_needs_attention,
    "Watching %1\$s" to R.string.ui_watching_1_s,
    "Waiting for log directory: %1\$s" to R.string.ui_waiting_for_log_directory_1_s,
    "Log reader: %1\$s" to R.string.ui_log_reader_1_s,
    "Failed \u00b7 %1\$s" to R.string.ui_failed_delivery_1_s,
)

fun localizedText(context: Context, text: String, vararg arguments: Any): String {
    val id = uiResources[text]
    if (id != null) return if (arguments.isEmpty()) context.getString(id) else context.getString(id, *arguments)
    val nearby = Regex("(\\d+) desktops? found nearby").matchEntire(text)
    if (nearby != null) return localizedText(context, "%1\$s desktops found nearby", nearby.groupValues[1])
    val prefixes = mapOf(
        "Watching " to "Watching %1\$s",
        "Waiting for log directory: " to "Waiting for log directory: %1\$s",
        "Log reader: " to "Log reader: %1\$s",
        "Failed · " to "Failed · %1\$s",
    )
    for ((prefix, template) in prefixes) {
        if (text.startsWith(prefix)) return localizedText(context, template, localizedText(context, text.removePrefix(prefix)))
    }
    return text
}

@Composable
fun uiText(text: String, vararg arguments: Any): String = localizedText(LocalContext.current, text, *arguments)
