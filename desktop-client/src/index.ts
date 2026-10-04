import { nativeGameSender } from './zomboid/gameSender.js';
import { macInputHelper } from './zomboid/macGameInput.js';
import { config } from './config.js';
import { advertiseDesktop } from './discovery/advertiser.js';
import { createTranslator } from './translation/createTranslator.js';
import { copyText } from './clipboard/clipboard.js';
import { MockChatSource, ProjectZomboidLogSource } from './zomboid/logWatcher.js';
import { createServer } from './websocket/server.js';

const translator = createTranslator(config.TRANSLATOR_PROVIDER, config.OPENAI_API_KEY, config.OPENAI_MODEL);
const app = createServer(config.MEOWLINGO_HOST, config.MEOWLINGO_PORT, translator, copyText, nativeGameSender(config.MEOWLINGO_AUTO_SEND), config.MEOWLINGO_HISTORY_COUNT);
if (process.platform === 'darwin' && config.MEOWLINGO_AUTO_SEND) {
  void macInputHelper()
    .then(() => console.log('macOS keyboard helper ready. Keep Zomboid foreground when sending from Android.'))
    .catch(error => console.error('macOS keyboard helper preparation failed:', error));
}
const source = process.argv.includes('--mock-chat') ? new MockChatSource() : new ProjectZomboidLogSource({
  directory: config.MEOWLINGO_LOG_DIR,
  initialHistoryCount: config.MEOWLINGO_HISTORY_COUNT,
  readHistory: config.MEOWLINGO_READ_HISTORY,
  onStatus: status => { console.log(status.message); app.setSourceStatus(status); },
});
let advertisement: ReturnType<typeof advertiseDesktop> | undefined;
let stopping = false;
let sourceStart: Promise<void> | undefined;
app.server.on('error', error => { console.error('Server error:', error.message); process.exitCode = 1; void source.stop(); });
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
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void shutdown().catch(error => { console.error(error); process.exitCode = 1; }); });
