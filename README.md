# MeowLingo

A second-screen Project Zomboid messenger. The desktop reads new game chat messages, passes them through a translation interface, and streams them to Android. Android replies use the selected translator, select a destination channel and are copied to the desktop clipboard. When Zomboid is foreground, the desktop attempts T, Ctrl+V, Enter.

**Incoming translation is currently passthrough. Replies bypass translation and are copied as received.** No OpenAI calls are made. The diagram below shows the intended translation flow once real translation is enabled.

```text
Project Zomboid
      │
      │ chat log
      ▼
MeowLingo Desktop
      │
      ├── translate foreign → Ukrainian
      │
      ▼
MeowLingo Android
      │
      │ Ukrainian reply
      ▼
MeowLingo Desktop
      │
      ├── translate Ukrainian → English
      └── copy to clipboard

Player:
T → Cmd/Ctrl+V → Enter
```

## Project structure

- `launch.mjs`: cross-platform console launcher with an interactive menu.
- `desktop-client/`: Node.js + TypeScript, ws, Zod, clipboardy, dotenv, tsx, and bonjour-service.
- `android-app/`: native Kotlin + Compose Material 3, MVVM, Coroutines, OkHttp, kotlinx.serialization, and DataStore.
- `shared/`: protocol documentation and language-independent JSON examples.

`ChatSource` supplies incoming messages; `ProjectZomboidLogSource` handles real logs and `MockChatSource` supplies test input. `Translator` defines incoming and outgoing translation methods for future integration. The mock provider uses `PassthroughTranslator`; OpenAI translates incoming chat to Ukrainian and replies to English before copying to the clipboard. The WebSocket server broadcasts chat, retains the latest 200 messages in memory for reconnect, and sends reply results only to the sender.

Android keeps session state in `ChatSession`, exposed by its ViewModel. A user-started foreground service owns the ongoing desktop connection so messages can arrive while the screen is locked or the app is backgrounded. Disconnect stops the service and automatic retries. The last address, selected desktop identity, auto-connect preference, and muted channels are saved with DataStore; chat history is kept in memory (up to 1,000 messages).

## Console launcher

Requires Node.js 22.13+, JDK 17, Android SDK 36, and platform-tools. Run from the project root:

```sh
node launch.mjs                # interactive menu
node launch.mjs setup          # install desktop dependencies; create config.json if missing
node launch.mjs desktop        # watch actual Project Zomboid logs
node launch.mjs mock           # simulated chat, unchanged text
node launch.mjs android-build  # build debug APK
node launch.mjs install        # build and install APK
node launch.mjs android-run    # build, install, and open Android
node launch.mjs all            # install/open Android, then start desktop with live logs
node launch.mjs build          # build both clients
node launch.mjs check          # desktop/launcher typecheck/tests + Android build/tests
node launch.mjs devices        # list adb devices
node launch.mjs usb            # build/install Android and start desktop over USB
node launch.mjs usb-connect    # connect an installed app to a running desktop over USB
node launch.mjs usb-disconnect # disconnect Android and remove the USB tunnel
node launch.mjs doctor         # inspect required tools
node launch.mjs help
```

Enable USB debugging and authorize your desktop on your phone, or start an emulator. With multiple connected devices, select one explicitly:

```sh
node launch.mjs android-run --device emulator-5554
```

The launcher resolves its paths relative to itself. It locates adb using `android-app/local.properties`, `ANDROID_HOME`, `ANDROID_SDK_ROOT`, the operating system's default SDK directory, or PATH. Installation uses `adb install -r` to retain app data. Stop the desktop with Ctrl+C.

## Automatic local-network connection

Start the desktop and open Android on the same local network. The app searches automatically and connects without typing an IP address. The desktop advertises `_meowlingo._tcp.local` using mDNS/DNS-SD; Android uses its native [Network Service Discovery API](https://developer.android.com/develop/connectivity/wifi/use-nsd). The advertised port follows `MEOWLINGO_PORT`, including custom ports.

A single discovered desktop is selected automatically. If several are available, Android uses the previously selected desktop when present; otherwise choose one in connection settings. The choice is remembered by service identity rather than by IP address. The auto-connect switch is saved. Manual connection remains available.

Discovery runs while Android is visible and releases its multicast lock when the app is backgrounded. An established connection continues through the foreground service. Disconnect pauses auto-connect for the current app session; **Search for desktop** resumes it. Typing a manual address also pauses auto-connect so discovery cannot replace your input or manual connection. Already connected sessions are never switched automatically.

Keep `MEOWLINGO_HOST=0.0.0.0` (the default) for LAN advertising. Set `MEOWLINGO_DISCOVERY=false` to disable desktop advertising. A loopback or specific-address bind skips advertising and requires a manual connection.

Allow multicast UDP 5353 and the configured WebSocket TCP port through the desktop firewall. Guest Wi-Fi, client isolation, VPN routing, and routers that block multicast can prevent discovery or connectivity. In those cases use the manual address. Standard Android emulators may not receive LAN multicast; use `ws://10.0.2.2:8765` manually when needed. Discovery does not authenticate the desktop; this MVP remains intended for a trusted LAN.

## USB cable connection

USB provides an alternative to local-network discovery. The launcher uses [adb reverse port forwarding](https://android.googlesource.com/platform/packages/modules/adb/+/refs/heads/main/docs/user/adb.1.md) so Android connects to `ws://127.0.0.1:<port>` and adb carries that connection to the desktop. The chat protocol and clipboard flow are unchanged. Wi-Fi is not required.

1. Enable Developer options and USB debugging on the phone.
2. Connect a USB data cable and authorize this computer when the phone prompts.
3. Run the full USB flow:

```sh
node launch.mjs usb
```

This builds and installs the latest Android app, creates the reverse tunnel, opens Android with its USB address automatically, and starts the desktop client with live logs. Android reconnects while the desktop starts. If the desktop is already running and the current Android build is installed, use:

```sh
node launch.mjs usb-connect
```

With multiple devices, append `--device SERIAL`. USB commands verify that the selected phone uses a wired adb transport; explicit emulator targets are also supported for testing. The tunnel uses `MEOWLINGO_PORT` from the environment or `desktop-client/config.json`. Keep the desktop listener accessible through localhost (`MEOWLINGO_HOST=0.0.0.0` or `127.0.0.1`). Android receives the selected port as a launcher intent and temporarily pauses LAN auto-connect for this session.

Unplugging the cable loses the tunnel. Plug it back in and rerun `usb-connect`. To stop this connection explicitly:

```sh
node launch.mjs usb-disconnect
```

This disconnects Android and removes only the configured MeowLingo reverse-port mapping. The desktop service stays running. Ctrl+C stops a desktop launched by `usb`; the tunnel remains until cable disconnection or `usb-disconnect`. To return to Wi-Fi, use **Search for desktop** in Android connection settings.

The equivalent manual setup for the default port is `adb reverse tcp:8765 tcp:8765`, followed by connecting Android to `ws://127.0.0.1:8765`. This development connection requires adb/platform-tools and USB debugging; simply charging the phone does not establish it.

Launcher USB command tests use a simulated adb executable on macOS/Linux: `node --test launcher.test.mjs`. A real-device test is still needed to verify your phone's USB authorization and transport.

## Live game chat

The default directory is `~/Zomboid/Logs` on macOS and `%USERPROFILE%\Zomboid\Logs` on Windows. The reader selects the newest top-level `YYYY-MM-DD_HH-MM_client chat <player>.txt` by session filename, ignoring debug logs and archived directories.

It polls every 750 ms, reads only appended bytes, waits for complete lines, preserves partial UTF-8 sequences, and switches to a newer session file automatically. File truncation and replacement are handled. Byte offsets prevent processing the same appended line twice; identical messages written as separate lines remain separate messages.

The parser follows the observed game format:

```text
[03-10-26 19:53:12.463][info] Got message from server: ChatMessage{chat=General, author='Player', text='Hello!'}.
```

Channel names and player text remain as provided by the game, including localized channel names. Known `<RGB:...>`, `<SPACE>`, and `<LINE>` formatting is normalized for display. Log timestamps use the desktop's local timezone and are sent as ISO-8601 UTC. Non-chat and outgoing diagnostic lines are ignored.

By default, the existing file is tailed from its end: old messages are not imported. New sessions discovered after startup are read from their beginning. Set `MEOWLINGO_READ_HISTORY=true` to import the current file on startup for testing or reviewing the current session. A missing log directory or file is retried automatically; source status appears in Android connection settings.

```env
MEOWLINGO_HOST=0.0.0.0
MEOWLINGO_PORT=8765
# Optional: override the default log directory.
# MEOWLINGO_LOG_DIR=/your/path/to/Zomboid/Logs
MEOWLINGO_READ_HISTORY=false
MEOWLINGO_DISCOVERY=true
OPENAI_API_KEY=
```

Keep API keys on desktop only. The current placeholder never uses them.

## Desktop commands

```sh
cd desktop-client
npm ci
npm run dev
```

The client creates `config.json` automatically. The server defaults to `0.0.0.0:8765`; allow this port through your desktop firewall on the trusted LAN. Run one server per port.

```sh
npm run mock:chat              # alternate input, no game required
npm run build
npm run typecheck
npm test
npm start                     # compiled service with live logs
npm start -- --mock-chat       # compiled service with simulated input
```

## Android

Open `android-app/` in Android Studio, select JDK 17, sync Gradle, and run `app` on Android 8/API 26 or newer. Install SDK 36 and set `ANDROID_HOME` or create ignored `android-app/local.properties` with `sdk.dir=/your/sdk/path`.

```sh
cd android-app
./gradlew assembleDebug
./gradlew installDebug
./gradlew lintDebug testDebugUnitTest
```

Windows: use `gradlew.bat`. Debug APK is exported to the project root: `dist/MeowLingo-android-debug.apk`.

Android discovers and connects to the desktop automatically. If discovery is unavailable, enter `ws://<desktop-LAN-IP>:8765` in connection settings, then Connect. For the standard Android emulator use `ws://10.0.2.2:8765`. Both devices must be able to reach each other on the same network.

The messenger includes light/dark themes, incoming/outgoing bubbles, author and time labels, channel filters, unread badges, search, and a jump-to-latest button. New messages do not pull you away from older messages while scrolling. When a future real translation differs from the source, incoming originals can be expanded.

To enable alerts, open connection settings and choose **Enable / manage notifications**. Android 13+ also asks for notification permission when you connect. New background messages generate a notification that opens their channel. Already replayed messages do not notify. Use **Mute channel** on a selected channel to suppress its alerts without hiding its messages; unread badges still update. A quiet ongoing notification shows connection status and provides Disconnect. These use Android's [notification permission](https://developer.android.com/develop/ui/views/notifications/notification-permission) and [remote messaging foreground service](https://developer.android.com/develop/background-work/services/fgs/service-types) mechanisms.

## Test the full flow

1. Start `node launch.mjs desktop`, or `node launch.mjs mock` without the game.
2. Open Android on the same network. It should discover and connect to the desktop automatically; allow notifications when prompted. If several desktops are found, choose one in settings.
3. Generate a new in-game message. Observe its author, text, channel, and time; filter its channel or search for its text.
4. Send a reply from the bottom composer. It appears pending, then shows **Keys sent to game** or **Copied to PC**. The text is unchanged by the placeholder. Paste into a desktop editor or into the selected game chat.
5. Change channels to inspect unread badges. Background Android to test alerts; muted channels remain quiet.
6. Restart the desktop or interrupt the network to test reconnect. Session history remains in Android; desktop reconnect replay is limited to its latest 200 messages.

Use the composer's **Send to** chips to select General, Local, Faction or Safehouse. Selecting a supported channel filter also selects the reply destination; All preserves it. Channel commands are added to the clipboard. Automatic sending requires Zomboid in the foreground, chat closed, and the default T binding. Windows and macOS are supported. On macOS, grant Accessibility and Automation access to the process running the desktop client. Set `MEOWLINGO_AUTO_SEND=false` to disable keyboard input. **Keys sent to game** reports keyboard input, not confirmed delivery; if Zomboid is inactive or input fails, paste manually. A clipboard failure is reported explicitly and the reply text remains visible. If disconnected before acknowledgement, delivery is unknown; replies are never resent automatically.

## Current limits and next steps

- Implement real translation behind `Translator`, on desktop only.
- The parser supports the observed single-line client chat format. Confirm additional game versions and unusual multi-line log formats before extending it.
- No authentication, database, TLS provisioning, or persistent chat history. Use a trusted local network; Android allows cleartext WebSockets for this MVP.
- Background notifications require an active user-started connection, network access, notification permission, and Android allowing the foreground service to run. Force-stopping the app ends delivery; no cloud push or boot-time auto-start is provided.
- Desktop shutdown loses its 200-message replay buffer. Android process termination loses its chat history. No offline reply queue or guaranteed delivery exists.
- Clipboard confirmation means the desktop copy API completed, not that the game received or sent the text.

Replies use the selected translator before copying to the desktop clipboard; `original` retains user input and `translated` contains the result. In mock mode both fields are equal. Current Android builds always serialize `type: "reply"`; desktop also accepts otherwise valid legacy replies with an omitted type. Validation errors include a valid supplied reply ID so the UI can resolve pending replies.

Before pasting, the desktop selects existing chat input with Ctrl+A because Zomboid can remember the previous channel command ([game chat documentation](https://theindiestone.com/forums/topic/24509-new-chat-system/)). No game acknowledgement is available; test keyboard sending while stationary with chat closed.


## OpenAI translation

Run `npm install`, then `npm run desktop:dev`. In Settings, select OpenAI, enter your API key and model, and save. You can edit context explanation instructions in the same form. The client restarts with the new settings.

CLI (`npm run dev` / `npm start`) creates `desktop-client/config.json` automatically. Edit that JSON to set `TRANSLATOR_PROVIDER` to `openai`, `OPENAI_API_KEY` and `OPENAI_MODEL`; then restart. Mock is the default and the fallback without a key. A previous `.env` is imported only when no config.json exists. The API key never travels to Android.


The [official OpenAI JavaScript SDK](https://developers.openai.com/api/docs/libraries) calls the Responses API with a 15-second timeout per attempt and at most two SDK retries for transient failures. Failed, empty or incomplete translations are logged without credentials and return the original text. Incoming chat is translated to natural Ukrainian; replies to English. Prompts preserve nicknames, URLs, numbers, place names and Project Zomboid terms and request only the translation. Messages are sent to OpenAI only when this provider is enabled; response storage is disabled. Automated tests simulate the API; account/model access must be checked with your own key.

On macOS, Typing uses direct Unicode text and Paste uses Ctrl+V, both via CGEvent in the MeowLingo process. Each sequence opens chat with T and finishes with Enter. This bypasses Project Zomboid's cached clipboard, which can paste an older message even when the system clipboard is correct. The desktop still copies the channel-prefixed reply for manual pasting. Validate this input method in your game; keyboard events are not a delivery acknowledgement.

Android channel colors can be edited under Settings → Channel colors using #RRGGBB values, with Save and Reset controls. Changes persist between launches and apply to filter buttons, send-channel menu rows and message bubbles. Text automatically uses a contrasting color. Defaults in `android-app/app/src/main/java/com/catemup/meowlingo/config/AppSettings.kt` are /say white, /all dark orange, /faction pink, /safehouse dark green, /yell red and /whisper purple. Unknown channels receive a stable generated color. Bubbles show the author and time above the message; the channel is indicated by color.

Android opens HTTP(S), www and discord.gg links from message text. The composer defaults to `/say`; tap Send for the current channel or hold it, slide over a channel and release to send. Drag outside the menu to cancel. Available destinations are `/all`, `/say`, `/yell`, `/faction`, `/safehouse` and `/whisper`. Whisper asks for a recipient nickname before sending and remembers it for the session. Install the updated desktop and Android together because replies now support an optional `recipient` field.

Set `"MEOWLINGO_HISTORY_COUNT": 10` in `desktop-client/config.json` to control how many recent messages are loaded from the newest chat log on desktop startup and replayed when Android connects (1–500). Restart the desktop after changing it. The default now loads recent history even with `MEOWLINGO_READ_HISTORY=false`; that flag enables reading the entire file instead. History comes from the currently selected log, then live tailing continues without duplicating imported messages.

## Installable desktop application

The Electron desktop app reuses the existing TypeScript client. It provides connection status, settings, activity logs and a tray/menu-bar icon. Closing its window keeps the client running; choose **Quit** from the tray menu to stop it. Only one installed app instance runs at a time. Stop a separately running CLI client before opening Electron on the same port.

Development, from `desktop-client`:

```sh
npm ci
npm run desktop:dev
```

Build an installer on the target operating system:

```sh
npm run desktop:make
```

macOS produces an `.app`, a ZIP and an installable DMG under `desktop-client/out/`; drag MeowLingo into Applications. Windows produces `MeowLingo-Setup.exe`. Builds include their own Electron/Node runtime. The macOS native Node-API module is compiled for arm64 and x64 and loaded in the main MeowLingo process; end users do not need Xcode. App settings, the OpenAI key and context explanation instructions are saved together in a private user `config.json`, accessible with **Show config.json**. The packaged app excludes your local config and legacy .env. On macOS the file is under `~/Library/Application Support/MeowLingo/config.json`; on Windows, under `%APPDATA%/MeowLingo/config.json`. CLI uses `desktop-client/config.json`. Desktop `config.example.json` contains only default instructions; other defaults come from the config schema.


On macOS, grant Accessibility only to the installed MeowLingo.app. Development builds use Electron. Test keyboard input with Zomboid foreground and chat closed.

## GitHub release builds

`.github/workflows/release.yml` runs when a GitHub Release is **published** (including prereleases), and also supports a manual workflow run. It builds and tests Android, macOS arm64/Intel x64, and Windows x64 in separate jobs. A final job attaches the APK, DMGs, desktop ZIPs and Windows installer to the published release. Manual runs retain files as Actions artifacts without publishing a release. Commit these files and push to your GitHub repository before using the workflow.

For a production Android APK, configure these repository Actions secrets:

- `ANDROID_KEYSTORE_BASE64`: base64-encoded existing release keystore.
- `ANDROID_KEYSTORE_PASSWORD`.
- `ANDROID_KEY_ALIAS`.
- `ANDROID_KEY_PASSWORD`.

Without a keystore secret, the workflow emits a clearly named **debug APK** that can be installed for testing. Its generated debug key can change between workflow runs, so updating may require uninstalling the previous build. Use one stable release key for distributable updates; a release-signed APK will not upgrade an existing debug-signed installation. Keep the keystore outside the repository. Increment the Android `versionCode`/`versionName` and desktop package version before each release.

Desktop installers are currently unsigned and macOS builds are not notarized. They are suitable for initial testing but operating systems may warn or block them. Production signing requires your Apple Developer/Windows signing credentials and a separate signing setup. Do not add the OpenAI API key to Actions: each user supplies their own key after installation.


### Explain context

Tap `?` on an incoming Android message to explain unclear slang, abbreviations, idioms, locations and Project Zomboid/server terms in Ukrainian. The desktop sends the original text and up to five preceding incoming chat messages through the OpenAI Responses API. Instructions exclude repeated translations and obvious words, and require uncertain meanings to be identified as probable.

Set your API key and model in desktop Settings or the local `config.json`. Explanation works independently of `TRANSLATOR_PROVIDER`, so mock translation can still use real OpenAI explanations. Missing credentials and API failures appear below the message with a retry option.

Explanations can be collapsed and reopened without another API request. Android retains results while the message is in its current session, and desktop caches results and deduplicates concurrent requests while messages remain in its history (at least 200 messages). Cache is in memory; restarting the desktop clears it. An expired message reports that it is unavailable. Restart the updated desktop and install the updated Android APK together.

Context explanation instructions are editable in desktop Settings and stored as `instructions` in the private `config.json`. Saving in the UI restarts the client and clears its in-memory explanation cache. CLI requires a restart after editing. The public `config.example.json` supplies default instructions and contains no key.



### Local build output

All installable builds are collected in the root `dist/` directory (ignored by Git):
- `node launch.mjs android-build`: `dist/MeowLingo-android-debug.apk`.
- `node launch.mjs desktop-build`: desktop installers and archives named by platform and architecture.
- Android `assembleRelease`: `dist/MeowLingo-android-release.apk` when signing is configured, or an explicitly named unsigned APK otherwise.

Direct Gradle assemble commands also export APKs automatically. Desktop `npm run desktop:make` exports installers automatically. Compiler outputs and packaging intermediates stay in their existing build directories. GitHub Actions uploads and publishes files from the same root `dist/` directory.


Android creates its own private `files/config.json` using `app/src/main/assets/config.defaults.json`. Address, auto-connect, preferred desktop, whisper recipient, hidden channels and custom colors persist there. Configure these from the app's Settings screen and channel controls; existing DataStore preferences are migrated automatically on first launch after updating. Android does not need an OpenAI key: AI requests and instructions are managed by the desktop.


The interactive launcher has four primary actions: development over USB (build/install/open Android and run the desktop with hot reload), desktop builds, Android APK, and build/install Android APK. Utilities follow the primary actions in the same menu, separated by a divider. Run `node launch.mjs dev` directly for USB development; connect the phone, enable USB debugging and authorize the computer first. Older CLI commands remain available for existing scripts.

Only DMG installers are exported for macOS to root `dist/`; Forge ZIP intermediates remain under `desktop-client/out/make/` and are not uploaded by release CI. Old exported macOS ZIP files are removed during collection.

Desktop Settings → Game input mode selects `Typing` (default, direct Unicode text on macOS) or `Paste` (Ctrl+V). Stored in config.json as `MEOWLINGO_INPUT_MODE`. Paste is faster but may reuse stale clipboard text in Zomboid on macOS; choose Typing if that occurs. Both modes check clipboard contents and game focus before sending.

Development launcher (`node launch.mjs dev`, menu option 1) installs/opens Android over USB and launches the Electron desktop window and tray. Desktop settings use `desktop-client/config.json`, matching the USB port configuration. TypeScript and Electron UI edits trigger a desktop restart. To start the desktop UI without Android, run `npm run desktop:dev` from desktop-client. Installed builds keep their separate private user config.

Android Settings → Theme offers Light, Dark and Device theme (default). Selection applies immediately, including system bar icons, and persists in the private config.json.

On macOS the desktop requests Accessibility on its first launch with automatic input enabled. A warning stays visible while permission is missing, with a button to open the correct System Settings page. Enable MeowLingo (Electron in development) and restart the client. macOS requires the user to grant the permission; clipboard functionality remains available without it.


Incoming messages and initial history are delivered immediately as original text. Translation runs in the background (up to three requests at once) and updates the same message without duplicates or new notifications. Historical timestamps are preserved.

Server announcements are cached locally in `translation-cache.sqlite` beside the desktop `config.json`. The single `server_messages` table has `original TEXT PRIMARY KEY`, `translation TEXT` and `explanation TEXT`. Only messages from author `Server` in the server channel are cached. A successful translation fills `translation`; pressing **?** fills `explanation` on the same row. Fields remain NULL until a successful response arrives. Repeated original messages reuse both results across restarts, regardless of model, instructions or surrounding conversation. Player messages are not persisted in this cache. Failed API calls and mock translations are never cached. **Clear translation cache** removes all rows; in-flight requests do not repopulate the cleared database. Already displayed messages and explanations remain visible on the phone.

The previous two-table cache is migrated automatically: translations are preserved, while hashed explanation entries that cannot be linked to original messages are discarded.

Application artwork comes from the root `icon-source.png`. On macOS, run `node scripts/generate-icons.mjs` after replacing it, then commit the generated Android and desktop assets. Release builds use these generated assets directly, without image conversion dependencies.

macOS release signing uses Hardened Runtime and preserves bundle ID `com.catemup.meowlingo.desktop`. GitHub Secrets: `MAC_CERTIFICATE_BASE64` (Developer ID Application certificate plus private key exported as .p12, base64), `MAC_CERTIFICATE_PASSWORD` (.p12 password), `MAC_SIGNING_IDENTITY` (full Developer ID Application identity), `APPLE_API_KEY_BASE64` (App Store Connect team .p8 API key, base64), `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`. CI imports a temporary keychain, signs the app and native module, notarizes/staples the app and DMG, verifies codesign and removes credentials. Without credentials, local/CI builds are ad-hoc signed and are not notarized. Only these ad-hoc builds disable library validation so Electron Framework can load without a Team ID; Developer ID builds retain library validation. Accessibility identity stability across updates requires the same Developer ID identity.

Release validation on a Mac: install the app into Applications, launch from Finder, enable MeowLingo once in Privacy & Security > Accessibility, relaunch and send an Android reply while Project Zomboid is foreground with chat closed. Confirm the actual message appears; `keys_sent` means events were issued, not game delivery. Paste may read stale game-internal clipboard contents; Typing remains available as a fallback. Validate on Intel and Apple Silicon. No helper permission or end-user compiler is required.

In Android App settings, choose **Native language** for incoming messages and **Chat language** for your outgoing messages. Both dropdowns offer 27 European languages and save your selection. Defaults are Ukrainian for incoming messages and English for outgoing messages. Changing the native language retranslates retained desktop history immediately. Update both desktop and Android clients to use this feature.
