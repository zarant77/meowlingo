import OpenAI from 'openai';
import { configSchema } from '../config.js';

export type ContextMessage = { author: string; channel: string; original: string };
export type ContextExplainer = (message: ContextMessage, previous: ContextMessage[]) => Promise<string>;

export function createContextExplainer(apiKey: string | undefined, model: string, options: { fetch?: typeof fetch; instructions?: string } = {}): ContextExplainer {
  const { instructions = configSchema.parse({}).instructions, ...clientOptions } = options;
  const client = apiKey ? new OpenAI({ apiKey, timeout: 15000, maxRetries: 2, ...clientOptions }) : undefined;
  return async (message, previous) => {
    if (!client) throw new Error('Set your OpenAI API key in desktop Settings to explain context.');
    try {
      const response = await client.responses.create({
        model, store: false,
        instructions,
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
