import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'dotenv';
import 'dotenv/config';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
const envFile = new URL('../.env', import.meta.url);
const fileEnv = existsSync(envFile) ? parse(readFileSync(envFile)) : {};
export const config = z.object({
  MEOWLINGO_HISTORY_COUNT: z.coerce.number().int().min(1).max(500).default(10),
  TRANSLATOR_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
  OPENAI_API_KEY: z.string().trim().optional(),
  OPENAI_MODEL: z.string().trim().min(1).default('gpt-6-luna'),
  MEOWLINGO_AUTO_SEND: z.enum(['true', 'false']).default('true').transform(value => value === 'true'),
  MEOWLINGO_HOST: z.string().min(1).default('0.0.0.0'),
  MEOWLINGO_PORT: z.coerce.number().int().min(1).max(65535).default(8765),
  MEOWLINGO_LOG_DIR: z.string().min(1).default(join(homedir(), 'Zomboid', 'Logs')).transform(path => path.startsWith('~/') ? join(homedir(), path.slice(2)) : path),
  MEOWLINGO_DISCOVERY: z.enum(['true', 'false']).default('true').transform(value => value === 'true'),
  MEOWLINGO_READ_HISTORY: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
}).parse({ ...process.env, ...fileEnv, OPENAI_API_KEY: fileEnv.OPENAI_API_KEY, OPENAI_MODEL: fileEnv.OPENAI_MODEL });
