import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configSchema, loadConfig, saveConfig } from '../src/config.js';
import { startDesktop } from '../src/desktop.js';

test('configuration reloads the selected env file and core can start and stop twice', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'meowlingo-desktop-'));
  try {
    const envFile = join(directory, '.env');
    await writeFile(envFile, "TRANSLATOR_PROVIDER=mock\nMEOWLINGO_HISTORY_COUNT=15\nMEOWLINGO_LOG_DIR='C:\\Users\\Player\\Zomboid\\Logs'\n");
    assert.equal(loadConfig(envFile).MEOWLINGO_HISTORY_COUNT, 15);
    assert.equal(loadConfig(envFile).MEOWLINGO_LOG_DIR, 'C:\\Users\\Player\\Zomboid\\Logs');
    await writeFile(envFile, 'MEOWLINGO_HISTORY_COUNT=20\n');
    assert.equal(loadConfig(envFile).MEOWLINGO_HISTORY_COUNT, 20);
    for (let i = 0; i < 2; i++) {
      const config = { ...configSchema.parse({ MEOWLINGO_HOST:'127.0.0.1', MEOWLINGO_DISCOVERY:'false', MEOWLINGO_AUTO_SEND:'false', MEOWLINGO_LOG_DIR:directory }), MEOWLINGO_PORT:0 };
      const desktop = startDesktop(config, false, async () => {});
      await once(desktop.server, 'listening');
      assert(desktop.server.address());
      await desktop.stop();
      assert.equal(desktop.server.address(), null);
    }
  } finally { await rm(directory, { recursive:true, force:true }); }
});

test('config.json is created, migrates legacy settings once and saves validated instructions and keys', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'meowlingo-config-'));
  try {
    const file = join(directory, 'config.json');
    await writeFile(join(directory, '.env'), 'OPENAI_API_KEY=test-placeholder\nMEOWLINGO_AUTO_SEND=false\nMEOWLINGO_PORT=9100\n');
    const first = loadConfig(file);
    assert.equal(first.OPENAI_API_KEY, 'test-placeholder');
    assert.equal(first.MEOWLINGO_AUTO_SEND, false);
    assert.equal(first.MEOWLINGO_PORT, 9100);
    await writeFile(join(directory, '.env'), 'OPENAI_API_KEY=different\n');
    assert.equal(loadConfig(file).OPENAI_API_KEY, 'test-placeholder');
    saveConfig(file, { ...first, instructions: 'Custom instructions\nSecond line', OPENAI_API_KEY: 'replacement' });
    assert.equal(loadConfig(file).instructions, 'Custom instructions\nSecond line');
    assert.equal(loadConfig(file).OPENAI_API_KEY, 'replacement');
    assert.throws(() => saveConfig(file, { ...first, instructions: '' }));
    assert.equal(loadConfig(file).OPENAI_API_KEY, 'replacement');
    const fresh = loadConfig(join(directory, 'fresh', 'config.json'));
    assert.equal(fresh.OPENAI_API_KEY, '');
    assert.equal(fresh.TRANSLATOR_PROVIDER, 'mock');
    assert(fresh.instructions.includes('Project Zomboid'));
  } finally { await rm(directory, { recursive:true, force:true }); }
});
