export interface Translator {
  translateToLanguage?(text: string, language: import("./languages.js").TranslationLanguage): Promise<string>;
  translateToUkrainian(text: string): Promise<string>;
  translateToEnglish(text: string): Promise<string>;
}
