import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { GameSendResult } from './gameSender.js';
const require = createRequire(import.meta.url);
interface MacInput { permissions(request: boolean): boolean; send(text: string, mode: 'typing' | 'paste'): Promise<GameSendResult> }
let native: MacInput | undefined;
function module(): MacInput {
  if (process.platform !== 'darwin') throw new Error('macOS input is only available on macOS.');
  native ??= require(fileURLToPath(new URL(`../../native/game-input-${process.arch}.node`, import.meta.url))) as MacInput;
  return native;
}
export function macInputPermissions(request = false): { trusted: boolean } { return { trusted: module().permissions(request) }; }
export function sendMacGameInput(text: string, mode: 'typing' | 'paste'): Promise<GameSendResult> { return module().send(text, mode); }
