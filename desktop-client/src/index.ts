import { config } from './config.js';
import { startDesktop } from './desktop.js';
const desktop = startDesktop(config, process.argv.includes('--mock-chat'));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  void desktop.stop().catch(error => { console.error(error); process.exitCode = 1; });
});
