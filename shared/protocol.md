# MeowLingo WebSocket protocol

UTF-8 JSON text frames over WebSocket. Default: `ws://<desktop-ip>:8765`. No authentication or TLS provisioning; use a trusted LAN. Incoming client frames are limited to 16 KiB; binary messages are rejected.

| Direction | Type | Fields |
|---|---|---|
| Desktop → Android | `chat` | `id` UUID, `timestamp` ISO-8601 UTC, `author`, `channel`, `original`, `translated`; optional `replayed` boolean |
| Android → Desktop | `reply` | `id` new UUID, `text` nonblank string (≤4000 characters); optional `channel` string (1–100 characters) |
| Desktop → sender | `reply_ready` | `id` reply UUID, `original`, `translated`, `copiedToClipboard` boolean, `gameSendStatus` |
| Desktop → Android | `status` | `status`, `message` strings |
| Android → Desktop | `ping` | no other fields |
| Desktop → sender | `pong` | no other fields |
| Desktop → sender | `error` | `code`, `message`; optional `id` for a failed reply |

Status values: `connected`, `source_waiting`, `source_watching`, `source_error`. Connection status is determined by the WebSocket transport; source status explains whether logs are being read. All clients receive source status updates.

The current desktop always supplies a channel. Android accepts older messages without one and falls back to General. Channel names are supplied by the game and may be localized. Reply channels General, Local, Faction and Safehouse map to /all, /say, /faction and /safehouse. The clipboard contains the channel command followed by the unchanged reply. Unsupported channels and multiline replies require manual pasting.

The selected translator processes incoming chat into Ukrainian and replies into English. Mock mode returns unchanged text. OpenAI mode returns translations, falling back to the original on API failure; `original` always preserves input.

Desktop retains the last 200 processed chats while running. On connection it sends the latest 10 with the same IDs and `replayed: true`. Android deduplicates by ID and does not notify or count replayed messages as new. Messages received live are broadcast to all clients; replies and their results go only to the sender. The buffer is lost on desktop restart.

Strict Zod validation rejects unknown client fields/types, malformed JSON, invalid UUIDs, and empty replies with `invalid_message`. Clipboard failures return `reply_ready` with `copiedToClipboard: false`, preserving the processed text. Android ignores malformed server messages and displays an error.

Replies are serialized across clients so clipboard writes complete in arrival order. The latest processed reply overwrites the clipboard. A true clipboard result does not confirm a paste into the game.

Android sends transport ping frames and retries a lost connection with delays starting at 2 seconds and capped at 30 seconds until explicitly disconnected. Session history is retained in memory (up to 1,000 messages). Pending replies become delivery-unknown after disconnection and are never automatically resent. No persisted history, durable delivery acknowledgement, or offline reply queue exists.

See [JSON examples](examples/). No TypeScript code is shared with Kotlin.

## LAN discovery

Desktop publishes `_meowlingo._tcp.local` through mDNS/DNS-SD on UDP 5353 after its WebSocket listener starts. The SRV record supplies the configured TCP port, A records supply IPv4 addresses, and TXT records contain `app=meowlingo`, `version=1`, and `id=<24 hexadecimal characters>`. The identifier is derived from the computer hostname and service port and stays stable across restarts at the same port. Renaming the computer or changing the port changes its identity.

Android resolves matching services, verifies the TXT marker/version/identity and usable address/port, then constructs `ws://<address>:<port>`. It connects to a sole service or the saved preferred service. Multiple unselected desktops require a choice in settings. Discovery is limited to visible app lifecycle; active connections keep running through the foreground service. A normal shutdown sends an mDNS goodbye announcement.

Discovery is not authentication and does not change the WebSocket message protocol.

## USB transport

With `adb reverse tcp:<port> tcp:<port>`, Android connects to `ws://127.0.0.1:<port>` through a USB adb tunnel. The WebSocket protocol is identical to LAN transport. The launcher opens MainActivity with integer extra `meowlingo.usbPort`; Android validates the port (1–65535), connects to loopback, and pauses LAN auto-connect. Boolean extra `meowlingo.disconnect` requests an explicit disconnect. No arbitrary address or API key is passed in these launcher extras.

USB forwarding requires a data cable, authorized USB debugging, and a desktop listener reachable through localhost. It is lost on USB disconnection and must be re-established afterward.

Replies currently copy the received text directly to the desktop clipboard, bypassing translation. The `translated` result field is retained for protocol compatibility and equals `original`. Current Android builds always serialize `type: "reply"`; desktop also accepts otherwise valid legacy replies with an omitted type. Validation errors include a valid supplied reply ID so the UI can resolve pending replies.

`gameSendStatus`: `keys_sent`, `not_focused`, `failed`, `disabled`, or `unsupported_channel`. Keys sent means the desktop issued T, Ctrl+V, Enter; it is not a game/server delivery acknowledgement. Keyboard input requires the game to be foreground with chat closed. Focus is checked between steps. Windows and macOS are supported; macOS needs Accessibility/Automation permissions. Set `MEOWLINGO_AUTO_SEND=false` for clipboard fallback.

Reply results may include `gameSendMessage` with desktop diagnostics (foreground application, missing permission, or input error). The desktop logs the same result. On macOS, Core Graphics keyboard events replace System Events; Accessibility permission is required for the launcher or keyboard helper.

Replies optionally include `recipient` (1–100 characters, without quotes/newlines) for `Whisper`. Desktop formats `/whisper "nickname" translated text`. `Yell` maps to `/yell`. Missing whisper recipients disable automatic sending. Android's default destination is Local (`/say`).

When Android returns to the foreground, it starts with its latest 10 session entries. New live messages then append normally. Replay uses only messages already processed by the running desktop; it does not import older log history when `MEOWLINGO_READ_HISTORY=false`.

## Translation language

Clients may set the `targetLanguage` WebSocket query parameter to an ISO language code (default: `uk`). Send `{"type":"settings","targetLanguage":"de"}` to change it while connected. The desktop replays retained messages with their existing IDs and updates their translations. Chat messages include `targetLanguage`; clients should ignore updates for an old language. Language selection is per connection. Replies accept an optional `targetLanguage` code (default: `en`) to choose the outgoing chat language independently of the incoming language. Context explanations retain the desktop-configured instructions.

Supported codes: `uk`, `en`, `de`, `fr`, `es`, `it`, `pt`, `pl`, `nl`, `cs`, `sk`, `ro`, `hu`, `bg`, `el`, `sv`, `da`, `no`, `fi`, `et`, `lv`, `lt`, `hr`, `sr`, `sl`, `tr`.
