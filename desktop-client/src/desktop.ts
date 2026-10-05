import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultConfigPath } from './config.js';
import { ServerTranslationCache, isServerMessage } from './translation/serverTranslationCache.js';
import { OpenAITranslator } from './translation/openAITranslator.js';
import { nativeGameSender } from './zomboid/gameSender.js';
import { macInputHelper } from './zomboid/macGameInput.js';
import type { DesktopConfig } from './config.js';
import { advertiseDesktop } from './discovery/advertiser.js';
import { createContextExplainer } from './translation/contextExplainer.js';
import { createTranslator } from './translation/createTranslator.js';
import { copyText, type CopyText } from './clipboard/clipboard.js';
import { MockChatSource, ProjectZomboidLogSource } from './zomboid/logWatcher.js';
import { createServer } from './websocket/server.js';

export function startDesktop(config: DesktopConfig, mockChat = false, copy: CopyText = copyText, cacheDirectory = dirname(process.env.MEOWLINGO_CONFIG_FILE ?? process.env.MEOWLINGO_ENV_FILE ?? fileURLToPath(defaultConfigPath))) {
const translator = createTranslator(config.TRANSLATOR_PROVIDER, config.OPENAI_API_KEY, config.OPENAI_MODEL);
let cache: ServerTranslationCache | undefined;
if (config.OPENAI_API_KEY) {
  try { cache = new ServerTranslationCache(join(cacheDirectory, 'translation-cache.sqlite')); }
  catch { console.error('Translation cache unavailable; translations will continue without caching.'); }
}
const translateIncoming = (message: import('./types/index.js').IncomingChatMessage) =>
  cache && translator instanceof OpenAITranslator && isServerMessage(message)
    ? cache.translate(message, text => translator.translateToUkrainianForCache(text))
    : translator.translateToUkrainian(message.text);
const explain = createContextExplainer(config.OPENAI_API_KEY, config.OPENAI_MODEL, { instructions: config.instructions });
const explainCached: typeof explain = (message, previous) => cache
  ? cache.explain(message, previous, explain)
  : explain(message, previous);
const app = createServer(config.MEOWLINGO_HOST, config.MEOWLINGO_PORT, translator, copy, nativeGameSender(config.MEOWLINGO_AUTO_SEND, config.MEOWLINGO_INPUT_MODE), config.MEOWLINGO_HISTORY_COUNT, explainCached, translateIncoming);
if (process.platform === 'darwin' && config.MEOWLINGO_AUTO_SEND) {
  void macInputHelper()
    .then(() => console.log('macOS keyboard helper ready. Keep Zomboid foreground when sending from Android.'))
    .catch(error => console.error('macOS keyboard helper preparation failed:', error));
}
const source = mockChat ? new MockChatSource() : new ProjectZomboidLogSource({
  directory: config.MEOWLINGO_LOG_DIR,
  initialHistoryCount: config.MEOWLINGO_HISTORY_COUNT,
  readHistory: config.MEOWLINGO_READ_HISTORY,
  onStatus: status => { console.log(status.message); app.setSourceStatus(status); },
});
let advertisement: ReturnType<typeof advertiseDesktop> | undefined;
let stopping = false;
let sourceStart: Promise<void> | undefined;
app.server.on('error', error => { console.error('Server error:', error.message); void source.stop(); });
app.server.on('listening', () => {
  if (stopping) return;
  console.log(`MeowLingo listening at ws://${config.MEOWLINGO_HOST}:${config.MEOWLINGO_PORT}`);
  advertisement = advertiseDesktop(config.MEOWLINGO_HOST, config.MEOWLINGO_PORT, config.MEOWLINGO_DISCOVERY);
  console.log(`Game input: ${config.MEOWLINGO_AUTO_SEND ? 'enabled' : 'disabled'} (${process.platform}; requires foreground Zomboid)`);
  console.log(`Translation: ${config.TRANSLATOR_PROVIDER === 'openai' && config.OPENAI_API_KEY ? `OpenAI (${config.OPENAI_MODEL})` : 'mock (text unchanged)'} · EN → UA / UA → EN`);
  if (source instanceof MockChatSource) app.setSourceStatus({ status: 'source_watching', message: 'Mock chat input active' });
  sourceStart = source.start(message => { void app.broadcastChat(message).catch(error => console.error('Chat processing failed:', error)); })
    .catch(error => { console.error('Chat source failed:', error); app.setSourceStatus({ status: 'source_error', message: 'Could not start chat source.' }); });
});
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await advertisement?.stop();
  await sourceStart;
  await source.stop();
  await app.close();
  cache?.close();
}
return { server: app.server, stop: shutdown, clearTranslationCache() {
  if (!cache) {
    const stored = new ServerTranslationCache(join(cacheDirectory, 'translation-cache.sqlite'));
    try { stored.clear(); } finally { stored.close(); }
  } else cache.clear();
  console.log('Server translation and explanation cache cleared.');
} };
}
