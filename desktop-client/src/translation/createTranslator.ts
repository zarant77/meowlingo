import { OpenAITranslator } from './openAITranslator.js';
import { PassthroughTranslator } from './passthroughTranslator.js';
import type { Translator } from './translator.js';
export function createTranslator(provider: 'mock' | 'openai', apiKey: string | undefined, model: string): Translator {
  if (provider === 'openai' && apiKey) return new OpenAITranslator(apiKey, model);
  if (provider === 'openai') console.warn('OpenAI API key is missing from desktop settings; using mock translation.');
  return new PassthroughTranslator();
}
