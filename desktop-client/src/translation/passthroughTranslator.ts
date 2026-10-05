import type { Translator } from './translator.js';

export class PassthroughTranslator implements Translator {
  async translateToLanguage(text: string): Promise<string> { return text; }
  async translateToUkrainian(text: string): Promise<string> { return text; }
  async translateToEnglish(text: string): Promise<string> { return text; }
}
