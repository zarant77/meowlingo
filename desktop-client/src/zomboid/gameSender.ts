import { sendMacGameInput } from './macGameInput.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
export type GameSendResult = { gameSendStatus: 'keys_sent' | 'not_focused' | 'failed' | 'disabled' | 'unsupported_channel'; gameSendMessage?: string };
export type GameSender = (clipboardText: string) => Promise<GameSendResult>;
export function channelCommand(channel: string): string | undefined {
  return ({ General: '/all', Local: '/say', Faction: '/faction', Safehouse: '/safehouse', Yell: '/yell', Whisper: '/whisper' } as Record<string, string>)[channel];
}
const powerShell = `$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
function CheckClipboard {
if ([System.Windows.Forms.Clipboard]::GetText() -cne $env:MEOWLINGO_EXPECTED_CLIPBOARD) { throw 'Clipboard changed; stopped keyboard input.' }
}
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class GameWindow {
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder text, int count);
}
'@
$window = [GameWindow]::GetForegroundWindow()
$title = New-Object System.Text.StringBuilder 512
[void][GameWindow]::GetWindowText($window, $title, 512)
if ($title.ToString() -notmatch 'Project Zomboid') {
@{gameSendStatus='not_focused'; gameSendMessage="Foreground window: $title"} | ConvertTo-Json -Compress; exit
}
CheckClipboard
[System.Windows.Forms.SendKeys]::SendWait('t')
Start-Sleep -Milliseconds 300
if ([GameWindow]::GetForegroundWindow() -ne $window) { throw 'Focus changed before paste.' }
[System.Windows.Forms.SendKeys]::SendWait('^a')
CheckClipboard
if ($env:MEOWLINGO_INPUT_MODE -eq 'paste') {
[System.Windows.Forms.SendKeys]::SendWait('^v')
} else {
$escapedKeys = @{ '+'='{+}'; '^'='{^}'; '%'='{%}'; '~'='{~}'; '('='{(}'; ')'='{)}'; '['='{[}'; ']'='{]}'; '{'='{{}'; '}'='{}}' }
foreach ($character in $env:MEOWLINGO_EXPECTED_CLIPBOARD.ToCharArray()) {
if ([GameWindow]::GetForegroundWindow() -ne $window) { throw 'Focus changed during typing.' }
CheckClipboard
$text = [string]$character
if ($escapedKeys.ContainsKey($text)) { $text = $escapedKeys[$text] }
[System.Windows.Forms.SendKeys]::SendWait($text)
Start-Sleep -Milliseconds 15
}
}
Start-Sleep -Milliseconds 200
if ([GameWindow]::GetForegroundWindow() -ne $window) { throw 'Focus changed before Enter.' }
CheckClipboard
[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
@{gameSendStatus='keys_sent'; gameSendMessage="T, Ctrl+A, $env:MEOWLINGO_INPUT_MODE, Enter issued."} | ConvertTo-Json -Compress`;

export function nativeGameSender(enabled: boolean, inputMode: 'typing' | 'paste' = 'typing'): GameSender {
  return async (clipboardText) => {
    if (!enabled) return { gameSendStatus: 'disabled', gameSendMessage: 'MEOWLINGO_AUTO_SEND=false' };
    try {
      if (process.platform === 'darwin') return await sendMacGameInput(clipboardText, inputMode);
      const result = process.platform === 'win32'
          ? await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-Command', powerShell], { timeout: inputMode === 'typing' ? 120000 : 15000, env: { ...process.env, MEOWLINGO_EXPECTED_CLIPBOARD: clipboardText, MEOWLINGO_INPUT_MODE: inputMode } })
          : undefined;
      if (!result) return { gameSendStatus: 'disabled', gameSendMessage: `Automatic input is unavailable on ${process.platform}.` };
      if (process.platform === 'win32') {
        const response: unknown = JSON.parse(result.stdout.trim());
        if (response && typeof response === 'object' && 'gameSendStatus' in response &&
          ['keys_sent', 'not_focused', 'failed'].includes(String(response.gameSendStatus)) &&
          'gameSendMessage' in response && typeof response.gameSendMessage === 'string') return response as GameSendResult;
        throw new Error('Unexpected keyboard helper response');
      }
      const output = result.stdout.trim();
      return { gameSendStatus: output === 'keys_sent' ? 'keys_sent' : 'not_focused', gameSendMessage: output };
    } catch (error) {
      console.error('Game input failed:', error);
      return { gameSendStatus: 'failed', gameSendMessage: error instanceof Error ? error.message : String(error) };
    }
  };
}
