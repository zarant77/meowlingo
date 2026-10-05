import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { WebSocket } from 'ws';
import { createServer } from '../src/websocket/server.js';
import { PassthroughTranslator } from '../src/translation/passthroughTranslator.js';
import type { Translator } from '../src/translation/translator.js';

async function connect(port: number) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);
  const messages: any[] = [];
  socket.on('message', raw => messages.push(JSON.parse(raw.toString())));
  await once(socket, 'open');
  return { socket, messages };
}
async function waitFor(messages: any[], type: string) {
  for (let i = 0; i < 200; i++) {
    const index = messages.findIndex(message => message.type === type);
    if (index >= 0) return messages.splice(index, 1)[0];
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${type}`);
}

test('broadcasts to two clients, rejects malformed traffic, translates and copies replies', async t => {
  const copies: string[] = [];
  const app = createServer('127.0.0.1', 0, new PassthroughTranslator(), async text => { copies.push(text); });
  t.after(() => app.close());
  await once(app.server, 'listening');
  const address = app.server.address(); assert(address && typeof address !== 'string');
  const a = await connect(address.port); const b = await connect(address.port);
  await waitFor(a.messages, 'status'); await waitFor(b.messages, 'status');
  a.socket.send('{bad json'); assert.equal((await waitFor(a.messages, 'error')).code, 'invalid_message');
  a.socket.send(JSON.stringify({ type: 'reply', id: 'bad', text: '' }));
  assert.equal((await waitFor(a.messages, 'error')).code, 'invalid_message');
  a.socket.send(Buffer.from('{}')); assert.equal((await waitFor(a.messages, 'error')).code, 'invalid_message');
  a.socket.send(JSON.stringify({ type: 'ping' })); await waitFor(a.messages, 'pong');
  await app.broadcastChat({ author: 'Hans', text: 'Kann jemand helfen?' });
  const chat = await waitFor(a.messages, 'chat');
  assert.equal(chat.translated, 'Kann jemand helfen?');
  assert.equal(chat.channel, 'General');
  assert.equal((await waitFor(b.messages, 'chat')).id, chat.id);
  const id = randomUUID();
  a.socket.send(JSON.stringify({ type: 'reply', id, text: "Так, ми зараз під'їдемо." }));
  const reply = await waitFor(a.messages, 'reply_ready');
  assert.equal(reply.id, id); assert.equal(reply.copiedToClipboard, true);
  assert.equal(reply.translated, "Так, ми зараз під'їдемо.");
  assert.deepEqual(copies, [reply.translated]);
  assert(!b.messages.some(message => message.type === 'reply_ready'));
  const c = await connect(address.port);
  const replay = await waitFor(c.messages, 'chat');
  assert.equal(replay.id, chat.id); assert.equal(replay.replayed, true);
});

test('reply translation failures and clipboard errors do not block later replies', async t => {
  const translator: Translator = {
    translateToUkrainian: async text => text,
    translateToEnglish: async () => { throw new Error('Translation unavailable'); },
  };
  const copies: string[] = [];
  const app = createServer('127.0.0.1', 0, translator, async text => {
    if (text === 'hello') throw new Error('clipboard unavailable');
    copies.push(text);
  });
  t.after(() => app.close()); await once(app.server, 'listening');
  const address = app.server.address(); assert(address && typeof address !== 'string');
  const client = await connect(address.port);
  client.socket.send(JSON.stringify({ type: 'reply', id: randomUUID(), text: 'hello' }));
  assert.equal((await waitFor(client.messages, 'reply_ready')).copiedToClipboard, false);
  const id = randomUUID(); client.socket.send(JSON.stringify({ type: 'reply', id, text: '  unchanged reply  ' }));
  const ready = await waitFor(client.messages, 'reply_ready');
  assert.equal(ready.id, id); assert.equal(ready.copiedToClipboard, true);
  assert.equal(ready.translated, '  unchanged reply  '); assert.deepEqual(copies, ['  unchanged reply  ']);
  client.socket.send(JSON.stringify({ type: 'ping' })); await waitFor(client.messages, 'pong');
});


test('accepts legacy Android replies without type and correlates rejected replies', async t => {
  const copies: string[] = [];
  const app = createServer('127.0.0.1', 0, new PassthroughTranslator(), async text => { copies.push(text); });
  t.after(() => app.close()); await once(app.server, 'listening');
  const address = app.server.address(); assert(address && typeof address !== 'string');
  const client = await connect(address.port);
  const id = randomUUID();
  client.socket.send(JSON.stringify({ id, text: 'test', channel: 'General' }));
  const ready = await waitFor(client.messages, 'reply_ready');
  assert.equal(ready.id, id); assert.equal(ready.copiedToClipboard, true); assert.deepEqual(copies, ['test']);
  const invalidId = randomUUID();
  client.socket.send(JSON.stringify({ type: 'reply', id: invalidId, text: '   ' }));
  const error = await waitFor(client.messages, 'error');
  assert.equal(error.code, 'invalid_message'); assert.equal(error.id, invalidId);
  client.socket.send(JSON.stringify({ id: randomUUID(), text: 'invalid', unexpected: true }));
  assert.equal((await waitFor(client.messages, 'error')).code, 'invalid_message');
  assert.deepEqual(copies, ['test']);
});

test('routes channel replies and only sends keys after a successful clipboard write', async t => {
  const copies: string[] = [];
  let sends = 0;
  const app = createServer('127.0.0.1', 0, new PassthroughTranslator(), async text => {
    if (text.includes('fail-copy')) throw new Error('Clipboard unavailable');
    copies.push(text);
  }, async expectedText => { assert.equal(expectedText, copies.at(-1)); sends++; return { gameSendStatus: 'keys_sent' }; });
  t.after(() => app.close());
  await once(app.server, 'listening');
  const address = app.server.address(); assert(address && typeof address !== 'string');
  const client = await connect(address.port);
  for (const [channel, text, status] of [
    ['Faction', 'Hello', 'keys_sent'], ['Server', 'Hello', 'unsupported_channel'],
    ['Local', 'first\nsecond', 'unsupported_channel'], ['General', 'fail-copy', 'disabled'],
    ['Safehouse', 'Ready', 'keys_sent'],
  ]) {
    client.socket.send(JSON.stringify({ type: 'reply', id: randomUUID(), channel, text }));
    assert.equal((await waitFor(client.messages, 'reply_ready')).gameSendStatus, status);
  }
  assert.equal(sends, 2);
  assert.equal(copies[0], '/faction Hello');
  assert.equal(copies.at(-1), '/safehouse Ready');
});

test('copies English translation with channel command and passes exactly that text to game input', async t => {
  const copies: string[] = [];
  const app = createServer('127.0.0.1', 0, {
    translateToUkrainian: async text => text,
    translateToEnglish: async text => { assert.equal(text, 'Привіт'); return 'Hello'; },
  }, async text => { copies.push(text); }, async text => {
    assert.equal(text, '/faction Hello');
    return { gameSendStatus: 'not_focused' };
  });
  t.after(() => app.close()); await once(app.server, 'listening');
  const address = app.server.address(); assert(address && typeof address !== 'string');
  const client = await connect(address.port);
  client.socket.send(JSON.stringify({ type: 'reply', id: randomUUID(), channel: 'Faction', text: 'Привіт' }));
  const result = await waitFor(client.messages, 'reply_ready');
  assert.equal(result.original, 'Привіт');
  assert.equal(result.translated, 'Hello');
  assert.equal(result.copiedToClipboard, true);
  assert.deepEqual(copies, ['/faction Hello']);
});

test('formats yell and whisper recipients separately from translated text', async t => {
  const copies: string[] = [];
  const app = createServer('127.0.0.1', 0, new PassthroughTranslator(), async text => { copies.push(text); }, async () => ({ gameSendStatus: 'not_focused' }));
  t.after(() => app.close()); await once(app.server, 'listening');
  const address = app.server.address(); assert(address && typeof address !== 'string');
  const client = await connect(address.port);
  for (const channel of ['Yell', 'Whisper']) {
    client.socket.send(JSON.stringify({type:'reply', id:randomUUID(), channel, text:'Hello', ...(channel === 'Whisper' ? {recipient:'Player One'} : {})}));
    assert.equal((await waitFor(client.messages, 'reply_ready')).copiedToClipboard, true);
  }
  assert.deepEqual(copies, ['/yell Hello', '/whisper "Player One" Hello']);
});

test('opening a client replays only the latest ten chats in order', async t => {
  const app = createServer('127.0.0.1', 0, new PassthroughTranslator(), async () => {});
  t.after(() => app.close()); await once(app.server, 'listening');
  for (let i = 0; i < 15; i++) await app.broadcastChat({author:'Player', text:`Message ${i}`});
  const address = app.server.address(); assert(address && typeof address !== 'string');
  const client = await connect(address.port);
  const messages = [];
  for (let i = 0; i < 10; i++) messages.push(await waitFor(client.messages, 'chat'));
  assert.deepEqual(messages.map(message => message.original), Array.from({length:10}, (_, i) => `Message ${i + 5}`));
  assert(messages.every(message => message.replayed));
  client.socket.send(JSON.stringify({type:'ping'})); await waitFor(client.messages, 'pong');
  assert(!client.messages.some(message => message.type === 'chat'));
});

test('explanations use original preceding messages, deduplicate requests and recover from failures', async t => {
  let calls = 0;
  const app = createServer('127.0.0.1', 0, {
    translateToUkrainian: async () => 'translated text',
    translateToEnglish: async text => text,
  }, async () => {}, undefined, 10, async (message, previous) => {
    calls++;
    assert.equal(message.original, 'brb at Muldraugh');
    assert.deepEqual(previous.map(chat => chat.original), ['before 2', 'before 3', 'before 4', 'before 5', 'before 6']);
    if (calls === 1) throw new Error('Unavailable');
    await new Promise(resolve => setTimeout(resolve, 30));
    return 'brb — скоро повернуся.';
  });
  t.after(() => app.close()); await once(app.server, 'listening');
  for (let i = 0; i < 7; i++) await app.broadcastChat({author:'Player', text:`before ${i}`});
  await app.broadcastChat({author:'Player', text:'brb at Muldraugh'});
  const address = app.server.address(); assert(address && typeof address !== 'string');
  const client = await connect(address.port);
  let target: any;
  for (let i = 0; i < 8; i++) target = await waitFor(client.messages, 'chat');
  const request = JSON.stringify({type:'explain', id:target.id});
  client.socket.send(request);
  assert.equal((await waitFor(client.messages, 'explanation')).error, 'Unavailable');
  client.socket.send(request); client.socket.send(request);
  assert.equal((await waitFor(client.messages, 'explanation')).explanation, 'brb — скоро повернуся.');
  await waitFor(client.messages, 'explanation');
  client.socket.send(request); await waitFor(client.messages, 'explanation');
  assert.equal(calls, 2);
  client.socket.send(JSON.stringify({type:'explain', id:randomUUID()}));
  assert.match((await waitFor(client.messages, 'explanation')).error, /no longer available/);
  client.socket.send(JSON.stringify({type:'ping'})); await waitFor(client.messages, 'pong');
});

test('replays originals immediately and later updates the same messages while translation is delayed', async t => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let active = 0, maximum = 0;
  const app = createServer('127.0.0.1', 0, {
    translateToUkrainian: async text => {
      active++; maximum = Math.max(maximum, active); await gate; active--; return 'UA: ' + text;
    },
    translateToEnglish: async text => text,
  }, async () => {});
  t.after(async () => { release(); await app.close(); });
  await once(app.server, 'listening');
  const jobs = Array.from({length:10}, (_, i) => app.broadcastChat({author:'Player', text:`Old ${i}`, replayed:true}));
  const address = app.server.address(); assert(address && typeof address !== 'string');
  const client = await connect(address.port);
  const history = [];
  for (let i = 0; i < 10; i++) history.push(await waitFor(client.messages, 'chat'));
  assert.deepEqual(history.map(chat => chat.original), Array.from({length:10}, (_, i) => `Old ${i}`));
  assert(history.every(chat => chat.translated === chat.original && chat.replayed));
  jobs.push(app.broadcastChat({author:'Player', text:'Live'}));
  const live = await waitFor(client.messages, 'chat');
  assert.equal(live.original, 'Live');
  release(); await Promise.all(jobs);
  const updates = [];
  for (let i = 0; i < 11; i++) updates.push(await waitFor(client.messages, 'chat'));
  assert.deepEqual(updates.map(chat => chat.id), [...history, live].map(chat => chat.id));
  assert(updates.every(chat => chat.translated === 'UA: ' + chat.original));
  assert(maximum <= 3);
});
