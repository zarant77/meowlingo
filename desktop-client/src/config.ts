import { readFileSync, existsSync, writeFileSync, renameSync, mkdirSync, chmodSync } from 'node:fs';
import { parse } from 'dotenv';

import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { z } from 'zod';
import { fileURLToPath } from 'node:url';

const defaultInstructions = z.object({ instructions: z.string().trim().min(1) }).parse(
  JSON.parse(readFileSync(new URL('../config.example.json', import.meta.url), 'utf8'))
).instructions;
const booleanSetting = (fallback: 'true' | 'false') => z.preprocess(
  value => typeof value === 'boolean' ? String(value) : value,
  z.enum(['true', 'false']).default(fallback).transform(value => value === 'true')
);
export const configSchema = z.object({
  instructions: z.string().trim().min(1).max(20000).default(defaultInstructions),
  MEOWLINGO_HISTORY_COUNT: z.coerce.number().int().min(1).max(500).default(10),
  TRANSLATOR_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
  OPENAI_API_KEY: z.string().trim().default(''),
  OPENAI_MODEL: z.string().trim().min(1).default('gpt-6-luna'),
  MEOWLINGO_INPUT_MODE: z.enum(['typing', 'paste']).default('typing'),
  MEOWLINGO_AUTO_SEND: booleanSetting('true'),
  MEOWLINGO_HOST: z.string().min(1).default('0.0.0.0'),
  MEOWLINGO_PORT: z.coerce.number().int().min(1).max(65535).default(8765),
  MEOWLINGO_LOG_DIR: z.string().min(1).default(join(homedir(), 'Zomboid', 'Logs')).transform(path => path.startsWith('~/') ? join(homedir(), path.slice(2)) : path),
  MEOWLINGO_DISCOVERY: booleanSetting('true'),
  MEOWLINGO_READ_HISTORY: booleanSetting('false'),
});
export type DesktopConfig = z.infer<typeof configSchema>;
export const defaultConfigPath = new URL('../config.json', import.meta.url);
export function saveConfig(file: string | URL, values: unknown): DesktopConfig {
  const settings = configSchema.parse(values);
  const target = file instanceof URL ? fileURLToPath(file) : file;
  mkdirSync(dirname(target), { recursive: true });
  const temporary = target + '.tmp';
  writeFileSync(temporary, JSON.stringify(settings, null, 2) + '\n', { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, target);
  return settings;
}
export function loadConfig(file: string | URL = defaultConfigPath): DesktopConfig {
  const target = file instanceof URL ? fileURLToPath(file) : file;
  // Explicit legacy paths remain readable; new application profiles use config.json.
  if (target.endsWith('.env')) {
    return configSchema.parse(existsSync(target) ? parse(readFileSync(target)) : {});
  }
  if (!existsSync(target)) {
    const legacy = join(dirname(target), '.env');
    const values = existsSync(legacy) ? parse(readFileSync(legacy)) : {};
    saveConfig(target, values);
  }
  return configSchema.parse(JSON.parse(readFileSync(target, 'utf8')));
}
export const config = loadConfig(process.env.MEOWLINGO_CONFIG_FILE ?? process.env.MEOWLINGO_ENV_FILE);
