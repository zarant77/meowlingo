import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, appendFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { parseLogLine } from '../src/zomboid/parser.js';
import { ProjectZomboidLogSource } from '../src/zomboid/logWatcher.js';
import { PassthroughTranslator } from '../src/translation/passthroughTranslator.js';
import { createServer } from '../src/websocket/server.js';
import type { IncomingChatMessage } from '../src/types/index.js';

const line = (text: string, channel = 'General', time = '19:53:12.463') =>
  `[03-10-26 ${time}][info] Got message from server: ChatMessage{chat=${channel}, author='Player One', text='${text}'}.\n`;
const wait = async (condition: () => boolean) => {
  for (let i = 0; i < 300; i++) { if (condition()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
  throw new Error('Timed out waiting for log processing');
};

test('parses observed log format, channels, apostrophes and game markup', () => {
  const parsed = parseLogLine(line("Don't steal. <RGB:128,0,128><LINE>Use 'Place Item'.<SPACE> OK", 'Safehouse').trim());
  assert.equal(parsed?.author, 'Player One'); assert.equal(parsed?.channel, 'Safehouse');
  assert.equal(parsed?.text, "Don't steal. \nUse 'Place Item'.  OK");
  assert(parsed?.timestamp && !Number.isNaN(Date.parse(parsed.timestamp)));
  assert.equal(parseLogLine('[03-10-26 19:48:31.001][info] Init chat system....'), null);
  assert.equal(parseLogLine(line('').trim()), null);
  assert.equal(parseLogLine(line('anything').replace('Got message from server:', 'Sending message:').trim()), null);
});

test('tails new lines exactly once, handles partial UTF-8, rotation and truncation', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'meowlingo-logs-'));
  const received: IncomingChatMessage[] = [];
  const source = new ProjectZomboidLogSource({ directory, pollIntervalMs: 10 });
  t.after(async () => { await source.stop(); await rm(directory, { recursive: true, force: true }); });
  const first = join(directory, '2026-10-03_19-47_client chat Player.txt');
  await writeFile(first, line('Old message'));
  await source.start(message => received.push(message));
  assert.equal(received.length, 0);
  const text = '\u043f\u0440\u0438\u0432\u0456\u0442';
  const encoded = Buffer.from(line(text, 'Safehouse'));
  const split = encoded.indexOf(Buffer.from(text)) + 1;
  await appendFile(first, encoded.subarray(0, split));
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(received.length, 0);
  await appendFile(first, encoded.subarray(split));
  await wait(() => received.length === 1);
  assert.equal(received[0]?.text, text);
  await new Promise(resolve => setTimeout(resolve, 40)); assert.equal(received.length, 1);
  await appendFile(first, line(text, 'Safehouse', '19:53:13.000'));
  await wait(() => received.length === 2);
  const next = join(directory, '2026-10-03_20-47_client chat Player.txt');
  await writeFile(next, line('New session', 'Faction'));
  await wait(() => received.length === 3); assert.equal(received[2]?.channel, 'Faction');
  await writeFile(next, '');
  await new Promise(resolve => setTimeout(resolve, 40));
  await appendFile(next, line('After truncation'));
  await wait(() => received.length === 4);
  assert.equal(received[3]?.text, 'After truncation');
  await source.stop();
  await appendFile(next, line('After stop'));
  await new Promise(resolve => setTimeout(resolve, 40)); assert.equal(received.length, 4);
});

test('waits for directory and reads new session created after startup', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'meowlingo-wait-'));
  const directory = join(temp, 'Logs'); const received: IncomingChatMessage[] = [];
  const source = new ProjectZomboidLogSource({ directory, pollIntervalMs: 10 });
  t.after(async () => { await source.stop(); await rm(temp, { recursive: true, force: true }); });
  await source.start(message => received.push(message));
  await mkdir(directory);
  await writeFile(join(directory, '2026-10-03_19-47_client chat Player.txt'), line('First message'));
  await wait(() => received.length === 1); assert.equal(received[0]?.text, 'First message');
});

test('log → WebSocket → reply → passthrough → clipboard flow', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'meowlingo-flow-'));
  const copies: string[] = [];
  const app = createServer('127.0.0.1', 0, new PassthroughTranslator(), async text => { copies.push(text); });
  const jobs: Promise<void>[] = [];
  const source = new ProjectZomboidLogSource({ directory, pollIntervalMs: 10, readHistory: true });
  t.after(async () => { await source.stop(); await Promise.all(jobs); await app.close(); await rm(directory, { recursive: true, force: true }); });
  await once(app.server, 'listening'); const address = app.server.address(); assert(address && typeof address !== 'string');
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}`);
  const received: any[] = []; socket.on('message', raw => received.push(JSON.parse(raw.toString())));
  await once(socket, 'open');
  await writeFile(join(directory, '2026-10-03_19-47_client chat Player.txt'), line('Hello from the game', 'Local'));
  await source.start(message => jobs.push(app.broadcastChat(message)));
  await wait(() => received.some(message => message.type === 'chat'));
  const chat = received.find(message => message.type === 'chat');
  assert.equal(chat.original, 'Hello from the game'); assert.equal(chat.translated, chat.original); assert.equal(chat.channel, 'Local');
  socket.send(JSON.stringify({ type: 'reply', id: '3a3425a2-28cd-4a9b-bef6-2e9bc0e05583', text: '\u041f\u0440\u0438\u0432\u0456\u0442!', channel: 'Local' }));
  await wait(() => received.some(message => message.type === 'reply_ready'));
  const reply = received.find(message => message.type === 'reply_ready');
  assert.equal(reply.translated, reply.original); assert.equal(reply.copiedToClipboard, true); assert.deepEqual(copies, [reply.original]);
});

test('cleans Discord announcement markup from the screenshot without changing its link', () => {
  const raw = 'Wanna join the <SPACE> <RGB:128,0,128> Discord? <SPACE> <LINE> <RGB:128,128,0> discord.gg/YJeDDhH7T2';
  const parsed = parseLogLine(line(raw, 'Server').trim());
  assert(parsed);
  assert.equal(parsed.channel, 'Server');
  assert.equal(parsed.author, 'Player One');
  assert(!/<(?:SPACE|LINE|RGB:)/i.test(parsed.text));
  assert(parsed.text.includes('\n'));
  assert(parsed.text.endsWith('discord.gg/YJeDDhH7T2'));
});

test('loads the configured last messages from an existing log and continues tailing without duplicates', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'meowlingo-history-'));
  const file = join(directory, '2026-10-04_01-05_client chat Player.txt');
  await writeFile(file, Array.from({length:15}, (_, i) => line(`Message ${i}`)).join('') + 'incomplete');
  const received: IncomingChatMessage[] = [];
  const source = new ProjectZomboidLogSource({directory, initialHistoryCount:10, pollIntervalMs:10});
  t.after(async () => { await source.stop(); await rm(directory, {recursive:true, force:true}); });
  await source.start(message => received.push(message));
  assert.deepEqual(received.map(message => message.text), Array.from({length:10}, (_, i) => `Message ${i+5}`));
  await appendFile(file, '\n' + line('New message'));
  await wait(() => received.length === 11);
  assert.equal(received.at(-1)?.text, 'New message');
});
