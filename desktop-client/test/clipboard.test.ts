import test from 'node:test';
import assert from 'node:assert/strict';
import { createVerifiedClipboardCopy } from '../src/clipboard/clipboard.js';

test('allows clipboard propagation before verifying and does not rewrite on each check', async () => {
  const writes: string[] = [];
  let reads = 0, fallback = false;
  const copy = createVerifiedClipboardCopy({
    writeText: text => { writes.push(text); },
    readText: () => ++reads < 3 ? 'stale value' : '/safehouse Test',
  }, async () => { fallback = true; }, async () => {});
  await copy('/safehouse Test');
  assert.deepEqual(writes, ['/safehouse Test']);
  assert.equal(reads, 3);
  assert.equal(fallback, false);
});

test('uses a separately verified native writer when Electron cannot verify', async () => {
  let nativeText = '';
  const copy = createVerifiedClipboardCopy({
    writeText: () => {},
    readText: () => 'stale value',
  }, async text => { nativeText = text; }, async () => {});
  await copy('/safehouse Test');
  assert.equal(nativeText, '/safehouse Test');
  const failed = createVerifiedClipboardCopy({
    writeText: () => { throw new Error('Electron unavailable'); },
    readText: () => '',
  }, async () => { throw new Error('Native clipboard unavailable'); }, async () => {});
  await assert.rejects(failed('Test'), /Native clipboard unavailable/);
});
