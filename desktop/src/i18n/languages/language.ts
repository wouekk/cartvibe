/**
 * Everything one interface language needs. Adding a language is a new file that exports one of these plus one line in
 * `languages/index.ts`; nothing else in the app, and nothing on the API, has to change.
 */
export interface LanguageDefinition {
  /** BCP 47 style code, lower case ("en", "pl", "de", "pt-br"). Stored as is in the user's preferences. */
  code: string;
  /** The language's own name, shown in the language menu ("Polski"). */
  label: string;
  /**
   * Translations keyed by the English text the templates use; a missing key shows the English text.
   * Month names ("January", "Jan") live here too.
   */
  messages: Record<string, string>;
  /** Noun forms keyed by the English singular, one entry per plural form of this language. Used by `plural`. */
  plurals?: Record<string, string[]>;
  /** Which entry of `plurals` a count takes. Defaults to the English rule (0 for one, 1 for everything else). */
  pluralIndex?: (count: number) => number;
}
