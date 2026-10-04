import { OpenAITranslator } from './openAITranslator.js';
import { PassthroughTranslator } from './passthroughTranslator.js';
import type { Translator } from './translator.js';
export function createTranslator(provider: 'mock' | 'openai', apiKey: string | undefined, model: string): Translator {
  if (provider === 'openai' && apiKey) return new OpenAITranslator(apiKey, model);
  if (provider === 'openai') console.warn('OPENAI_API_KEY is missing from desktop-client/.env; using mock translation.');
  return new PassthroughTranslator();
}
