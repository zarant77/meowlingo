export interface Translator {
  translateToUkrainian(text: string): Promise<string>;
  translateToEnglish(text: string): Promise<string>;
}
