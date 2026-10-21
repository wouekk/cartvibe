import { ENGLISH } from "./en";
import { LanguageDefinition } from "./language";
import { POLISH } from "./pl";

export * from "./language";

/**
 * Every language the interface offers. To add one: copy `pl.ts` and its message files to `xx.ts`, translate the
 * messages, and list it here. The first entry is the fallback.
 */
export const LANGUAGES: readonly LanguageDefinition[] = [ENGLISH, POLISH];

export function findLanguage(code: unknown): LanguageDefinition | undefined {
  return typeof code === "string" ? LANGUAGES.find((language) => language.code === code.toLowerCase()) : undefined;
}
