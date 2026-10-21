/** What `TranslationService.t` looks like to code that has no injector (pure helpers take one as an argument). */
export type TranslateFn = (text: string, params?: Record<string, string | number | null | undefined>) => string;

/** English with the values filled in; the default for helpers that are called without a translator. */
export const englishTranslate: TranslateFn = (text, params) =>
  params ? text.replace(/\{(\w+)\}/g, (match, name) => String(params[name] ?? match)) : text;
