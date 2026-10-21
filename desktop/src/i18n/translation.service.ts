import { computed, effect, Injectable, signal } from "@angular/core";
import { findLanguage, LANGUAGES, LanguageDefinition } from "./languages";

export type AppLanguage = string;

/** What the language menu lists, straight from the registry. */
export const APP_LANGUAGES: { code: AppLanguage; label: string }[] = LANGUAGES.map(({ code, label }) => ({ code, label }));

const STORAGE_KEY = "cartvibe.language";

/** The code when the registry has that language, else undefined. */
export function asLanguage(value: unknown): AppLanguage | undefined {
  return findLanguage(value)?.code;
}

function readStored(): AppLanguage | undefined {
  try {
    return asLanguage(localStorage.getItem(STORAGE_KEY));
  } catch {
    return undefined;
  }
}

/** The first browser language the registry has ("pl-PL" matches "pl"), else the registry's first language. */
function browserLanguage(): AppLanguage {
  const preferred = typeof navigator === "undefined" ? [] : (navigator.languages ?? [navigator.language]);
  for (const tag of preferred) {
    const lower = (tag ?? "").toLowerCase();
    const match = findLanguage(lower) ?? findLanguage(lower.split("-")[0]);
    if (match) {
      return match.code;
    }
  }

  return LANGUAGES[0].code;
}

const MONTH_NAMES = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g;

/**
 * The interface language. The English text in the templates is the key: `t("Add receipt")` returns the active language's
 * text when it has one, else the English text itself, so a missing translation is never blank. Languages are data
 * (`languages/`); this service knows none of them by name.
 * Order of precedence: the saved preference (set by LanguageSyncService once signed in), then what was chosen on this
 * device, then the browser's language. It has no dependencies on purpose: every template pipe uses it.
 */
@Injectable({ providedIn: "root" })
export class TranslationService {
  /** The language saved with the signed-in person's preferences. */
  public readonly saved = signal<AppLanguage | undefined>(undefined);

  private readonly chosen = signal<AppLanguage | undefined>(readStored());

  public readonly language = computed<AppLanguage>(() => this.saved() ?? this.chosen() ?? browserLanguage());

  private readonly definition = computed<LanguageDefinition>(() => findLanguage(this.language()) ?? LANGUAGES[0]);

  constructor() {
    effect(() => {
      if (typeof document !== "undefined") {
        document.documentElement.lang = this.language();
      }
    });
  }

  public t(text: string, params?: Record<string, string | number>): string {
    const translated = this.definition().messages[text] ?? text;
    return params ? translated.replace(/\{(\w+)\}/g, (match, key) => String(params[key] ?? match)) : translated;
  }

  /** "1 item" / "3 items": the noun for a count, in the language's own plural forms when it has them. */
  public plural(count: number, singular: string, plural: string): string {
    const { plurals, pluralIndex } = this.definition();
    const forms = plurals?.[singular];
    if (forms) {
      return forms[Math.min(pluralIndex ? pluralIndex(count) : count === 1 ? 0 : 1, forms.length - 1)];
    }

    return count === 1 ? singular : plural;
  }

  /** Translates the English month names inside a period label ("October 2026", "12 Oct – 18 Oct 2026"). */
  public months(text: string): string {
    const messages = this.definition().messages;
    return text.replace(MONTH_NAMES, (month) => messages[month] ?? month);
  }

  /** Switches now and remembers the choice on this device. */
  public choose(language: AppLanguage): void {
    const code = asLanguage(language);
    if (!code) {
      return;
    }

    this.chosen.set(code);
    this.saved.set(undefined);
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // private mode: the saved preference carries it once signed in
    }
  }
}
