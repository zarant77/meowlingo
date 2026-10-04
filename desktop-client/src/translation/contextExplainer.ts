import OpenAI from 'openai';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

const configFile = new URL('../../config/context-explanation.json', import.meta.url);
const explanationConfigSchema = z.object({ instructions: z.string().trim().min(1) }).strict();

export type ContextMessage = { author: string; channel: string; original: string };
export type ContextExplainer = (message: ContextMessage, previous: ContextMessage[]) => Promise<string>;

export function createContextExplainer(apiKey: string | undefined, model: string, options: { fetch?: typeof fetch } = {}): ContextExplainer {
  const client = apiKey ? new OpenAI({ apiKey, timeout: 15000, maxRetries: 2, ...options }) : undefined;
  return async (message, previous) => {
    if (!client) throw new Error('Configure OPENAI_API_KEY in the desktop .env to explain context.');
    try {
      const config = explanationConfigSchema.parse(JSON.parse(await readFile(configFile, 'utf8')));
      const response = await client.responses.create({
        model, store: false,
        instructions: config.instructions,
        input: JSON.stringify({ previous, message }),
      });
      if (response.status !== 'completed' || !response.output_text?.trim()) throw new Error('Incomplete explanation');
      return response.output_text.trim();
    } catch (error) {
      console.error('OpenAI context explanation failed.', error instanceof OpenAI.APIError
        ? { name: error.name, status: error.status, code: error.code } : { name: error instanceof Error ? error.name : 'UnknownError' });
      throw new Error('Context explanation failed. Please try again.');
    }
  };
}
