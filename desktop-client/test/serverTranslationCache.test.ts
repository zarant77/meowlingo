import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ServerTranslationCache } from '../src/translation/serverTranslationCache.js';

const server = { author: 'Server', channel: 'Server', text: 'Repeated announcement' };

test('persists exact server translations across restarts and never caches players', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'meowlingo-cache-'));
  const file = join(directory, 'cache.sqlite');
  let calls = 0;
  const translate = async (text: string) => { calls++; return `Translated ${text}`; };
  let cache = new ServerTranslationCache(file);
  try {
    await cache.translate(server, translate);
    cache.close();
    cache = new ServerTranslationCache(file);
    assert.equal(await cache.translate(server, translate), 'Translated Repeated announcement');
    assert.equal(calls, 1);
    await cache.translate({ ...server, channel: 'Сервер' }, translate);
    assert.equal(calls, 1);
    for (let i = 0; i < 2; i++) await cache.translate({ ...server, author: 'Player' }, translate);
    for (let i = 0; i < 2; i++) await cache.translate({ ...server, channel: 'Local' }, translate);
    assert.equal(calls, 5);
    await cache.translate({ ...server, text: server.text + '!' }, translate);
    assert.equal(calls, 6);
    cache.close();
    cache = new ServerTranslationCache(file);
    await cache.translate(server, translate);
    assert.equal(calls, 6);
    cache.clear();
    await cache.translate(server, translate);
    assert.equal(calls, 7);
  } finally { cache.close(); rmSync(directory, { recursive: true }); }
});

test('deduplicates pending requests, skips failures and does not repopulate after clearing', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'meowlingo-cache-'));
  const cache = new ServerTranslationCache(join(directory, 'cache.sqlite'));
  try {
    let calls = 0;
    let resolve!: (text: string) => void;
    const translate = () => { calls++; return new Promise<string>(done => { resolve = done; }); };
    const first = cache.translate(server, translate);
    const second = cache.translate(server, translate);
    await Promise.resolve();
    assert.equal(calls, 1);
    cache.clear();
    resolve('Translation');
    assert.deepEqual(await Promise.all([first, second]), ['Translation', 'Translation']);
    await assert.rejects(cache.translate(server, async () => { calls++; throw new Error('API unavailable'); }));
    assert.equal(calls, 2);
    assert.equal(await cache.translate(server, async () => { calls++; return 'Recovered'; }), 'Recovered');
    assert.equal(calls, 3);
    assert.equal(await cache.translate(server, async () => { throw new Error('Should use cache'); }), 'Recovered');
  } finally { cache.close(); rmSync(directory, { recursive: true }); }
});


test('stores explanation on the same row and keeps it when translation finishes later', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'meowlingo-cache-'));
  const file = join(directory, 'cache.sqlite');
  let cache = new ServerTranslationCache(file);
  const message = { author: server.author, channel: server.channel, original: server.text };
  try {
    let resolve!: (text: string) => void;
    const pending = cache.translate(server, () => new Promise(done => { resolve = done; }));
    await Promise.resolve();
    assert.equal(await cache.explain(message, [], async () => 'Explanation'), 'Explanation');
    resolve('Translation');
    await pending;
    cache.close();
    cache = new ServerTranslationCache(file);
    assert.equal(await cache.explain(message, [{ author: 'Player', channel: 'Local', original: 'Changed context' }], async () => { throw new Error('Should use cache'); }), 'Explanation');
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(file);
    try {
      assert.deepEqual({ ...db.prepare('SELECT * FROM server_messages').get() }, {
        original: server.text, translation: 'Translation', explanation: 'Explanation',
      });
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'").get()?.count, 2);
    } finally { db.close(); }
    for (let i = 0; i < 2; i++) {
      assert.equal(await cache.explain({ ...message, author: 'Player' }, [], async () => `Uncached ${i}`), `Uncached ${i}`);
    }
    cache.clear();
    await assert.rejects(cache.explain(message, [], async () => { throw new Error('API unavailable'); }));
    assert.equal(await cache.explain(message, [], async () => 'Fresh explanation'), 'Fresh explanation');
    assert.equal(await cache.translate(server, async () => 'Fresh translation'), 'Fresh translation');
  } finally { cache.close(); rmSync(directory, { recursive: true }); }
});

test('translation rows initially have no explanation and old translations migrate to the Ukrainian table', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'meowlingo-cache-'));
  const file = join(directory, 'cache.sqlite');
  const { DatabaseSync } = await import('node:sqlite');
  const legacy = new DatabaseSync(file);
  legacy.exec(`CREATE TABLE translations (namespace TEXT, original TEXT, translated TEXT);
    CREATE TABLE explanations (namespace TEXT, original TEXT, translated TEXT);`);
  legacy.prepare('INSERT INTO translations VALUES (?, ?, ?)').run('old', server.text, 'Saved translation');
  legacy.close();
  const cache = new ServerTranslationCache(file);
  try {
    assert.equal(await cache.translate(server, async () => { throw new Error('Should migrate'); }), 'Saved translation');
    const db = new DatabaseSync(file);
    try {
      assert.deepEqual({ ...db.prepare('SELECT * FROM server_messages').get() }, {
        original: server.text, translation: 'Saved translation', explanation: null,
      });
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'").get()?.count, 2);
    } finally { db.close(); }
  } finally { cache.close(); rmSync(directory, { recursive: true }); }
});

 test('keeps translations separate by language across restarts and clears all languages', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'meowlingo-cache-'));
  const file = join(directory, 'cache.sqlite');
  let cache = new ServerTranslationCache(file);
  try {
    assert.equal(await cache.translateLanguage(server, 'uk', async () => 'Ukrainian'), 'Ukrainian');
    assert.equal(await cache.translateLanguage(server, 'de', async () => 'German'), 'German');
    cache.close(); cache = new ServerTranslationCache(file);
    assert.equal(await cache.translateLanguage(server, 'de', async () => { throw new Error('Should be cached'); }), 'German');
    assert.equal(await cache.translateLanguage(server, 'uk', async () => { throw new Error('Should be cached'); }), 'Ukrainian');
    cache.clear();
    assert.equal(await cache.translateLanguage(server, 'de', async () => 'Fresh German'), 'Fresh German');
  } finally { cache.close(); rmSync(directory, { recursive: true }); }
});
