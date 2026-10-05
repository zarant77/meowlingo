import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, access, writeFile, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const execute = promisify(execFile);
export const macGameInputSource = String.raw`
import AppKit
import ApplicationServices
import CoreGraphics
import Foundation

func report(_ status: String, _ message: String) -> Never {
    let data = try! JSONSerialization.data(withJSONObject: ["gameSendStatus": status, "gameSendMessage": message])
    print(String(data: data, encoding: .utf8)!)
    exit(0)
}
let app = NSWorkspace.shared.frontmostApplication
let name = app?.localizedName ?? "unknown"
let bundle = app?.bundleIdentifier ?? "unknown"
let path = app?.bundleURL?.path ?? "unknown"
if CommandLine.arguments.contains("--request-permissions") {
    let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
    _ = AXIsProcessTrustedWithOptions(options)
    _ = CGRequestPostEventAccess()
}
if CommandLine.arguments.contains("--permissions") || CommandLine.arguments.contains("--request-permissions") {
    let data = try! JSONSerialization.data(withJSONObject: [
        "trusted": AXIsProcessTrusted() && CGPreflightPostEventAccess(),
        "helperPath": CommandLine.arguments[0]
    ])
    print(String(data: data, encoding: .utf8)!)
    exit(0)
}
let trusted = AXIsProcessTrusted() && CGPreflightPostEventAccess()
let context = "Foreground: \(name); bundle: \(bundle); path: \(path); keyboard permission: \(trusted)"
if CommandLine.arguments.contains("--diagnose") { report("disabled", context) }
if !trusted {
    report("failed", "Accessibility permission missing. In System Settings > Privacy & Security > Accessibility, enable your terminal/client launcher or add this helper: \(CommandLine.arguments[0]). Restart the desktop client. \(context)")
}
guard let app = app else { report("not_focused", context) }
var title = ""
let element = AXUIElementCreateApplication(app.processIdentifier)
var window: CFTypeRef?
if AXUIElementCopyAttributeValue(element, kAXFocusedWindowAttribute as CFString, &window) == .success,
   let window = window, CFGetTypeID(window) == AXUIElementGetTypeID() {
    var value: CFTypeRef?
    if AXUIElementCopyAttributeValue(window as! AXUIElement, kAXTitleAttribute as CFString, &value) == .success {
        title = value as? String ?? ""
    }
}
let identity = "\(name) \(bundle) \(path) \(title)".lowercased().replacingOccurrences(of: " ", with: "")
if !identity.contains("projectzomboid") { report("not_focused", "\(context); title: \(title)") }
guard CommandLine.arguments.count == 2 || CommandLine.arguments.count == 3 else { report("failed", "Expected clipboard text argument.") }
let expectedText = CommandLine.arguments[1]
let inputMode = CommandLine.arguments.count == 3 ? CommandLine.arguments[2] : "typing"
guard inputMode == "typing" || inputMode == "paste" else { report("failed", "Unsupported input mode.") }
func checkClipboard() {
    if NSPasteboard.general.string(forType: .string) != expectedText {
        report("failed", "Clipboard changed since reply was received; stopped input to avoid sending unrelated text.")
    }
}
checkClipboard()
let gamePid = app.processIdentifier
func checkFocus(_ stage: String) {
    if NSWorkspace.shared.frontmostApplication?.processIdentifier != gamePid {
        report("not_focused", "Focus changed before \(stage); stopped keyboard input.")
    }
}
let source = CGEventSource(stateID: .hidSystemState)
func key(_ code: CGKeyCode, _ down: Bool, _ flags: CGEventFlags = []) {
    guard let event = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: down) else {
        report("failed", "Unable to create keyboard event.")
    }
    event.flags = flags
    event.post(tap: .cghidEventTap)
}
func press(_ code: CGKeyCode, _ flags: CGEventFlags = []) {
    key(code, true, flags)
    Thread.sleep(forTimeInterval: 0.1)
    key(code, false, flags)
}
func controlPress(_ code: CGKeyCode) {
    key(59, true, .maskControl)
    Thread.sleep(forTimeInterval: 0.05)
    press(code, .maskControl)
    key(59, false)
}
checkFocus("T")
press(17)
Thread.sleep(forTimeInterval: 0.6)
checkFocus("Ctrl+A")
controlPress(0)
Thread.sleep(forTimeInterval: 0.3)
checkFocus("text input")
checkClipboard()
// Always use direct text on macOS: the game may paste a stale internal clipboard.
// Bypass the game's cached clipboard by posting the exact reply as Unicode.
for (index, character) in expectedText.enumerated() {
    if index % 32 == 0 {
        checkFocus("text input")
        checkClipboard()
        Thread.sleep(forTimeInterval: 0.005)
    }
    let units = Array(String(character).utf16)
    guard let down = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: true),
          let up = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: false) else {
        report("failed", "Unable to create text input event.")
    }
    units.withUnsafeBufferPointer { buffer in
        down.keyboardSetUnicodeString(stringLength: buffer.count, unicodeString: buffer.baseAddress!)
        up.keyboardSetUnicodeString(stringLength: buffer.count, unicodeString: buffer.baseAddress!)
    }
    down.flags = []
    up.flags = []
    down.post(tap: .cghidEventTap)
    Thread.sleep(forTimeInterval: 0.01)
    up.post(tap: .cghidEventTap)
    // Give the game time to consume each text event. Burst input loses prefixes.
    Thread.sleep(forTimeInterval: index < 16 ? 0.015 : 0.005)
}
Thread.sleep(forTimeInterval: 0.5)
checkFocus("Enter")
checkClipboard()
press(36)
let fallback = inputMode == "paste" ? " Paste mode used direct text on macOS to avoid stale game clipboard contents." : ""
report("keys_sent", "Core Graphics issued T, Ctrl+A, direct Unicode text, Enter.\(fallback) \(context)")
`;
let helperBuild: Promise<string> | undefined;
export function macInputHelper(): Promise<string> {
  if (!helperBuild) helperBuild = buildHelper().catch(error => { helperBuild = undefined; throw error; });
  return helperBuild;
}
async function buildHelper(): Promise<string> {
  if (process.env.MEOWLINGO_MAC_HELPER) {
    await access(process.env.MEOWLINGO_MAC_HELPER);
    return process.env.MEOWLINGO_MAC_HELPER;
  }
  const hash = createHash('sha256').update(macGameInputSource).digest('hex').slice(0, 16);
  const directory = join(homedir(), 'Library', 'Caches', 'MeowLingo', `keyboard-${hash}`);
  const helper = join(directory, 'meowlingo-game-input');
  try { await access(helper); return helper; } catch { /* Compile the helper once per source version. */ }
  await mkdir(directory, { recursive: true });
  const source = join(directory, 'GameInput.swift');
  await writeFile(source, macGameInputSource);
  console.log('Building macOS keyboard helper (requires Xcode Command Line Tools)...');
  const output = `${helper}.${process.pid}.building`;
  try {
    await execute('/usr/bin/xcrun', ['swiftc', '-module-cache-path', join(directory, 'ModuleCache'), source, '-o', output], { timeout: 180000 });
    await rename(output, helper);
  } finally {
    await rm(output, { force: true });
  }
  console.log(`macOS keyboard helper: ${helper}`);
  return helper;
}

export async function macInputPermissions(request = false): Promise<{ trusted: boolean; helperPath: string }> {
  const helper = await macInputHelper();
  const { stdout } = await execute(helper, [request ? '--request-permissions' : '--permissions'], { timeout: 15000 });
  const result = JSON.parse(stdout);
  if (typeof result.trusted !== 'boolean' || typeof result.helperPath !== 'string') throw new Error('Invalid permission status');
  return result;
}
