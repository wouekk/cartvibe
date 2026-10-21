import { computed, effect, Injectable, signal } from "@angular/core";
import { PL, PL_PLURALS } from "./pl";

export type AppLanguage = "en" | "pl";

export const APP_LANGUAGES: { code: AppLanguage; label: string }[] = [
  { code: "en", label: "English" },
  { code: "pl", label: "Polski" },
];

const STORAGE_KEY = "cartvibe.language";

export function asLanguage(value: unknown): AppLanguage | undefined {
  return value === "en" || value === "pl" ? value : undefined;
}

function readStored(): AppLanguage | undefined {
  try {
    return asLanguage(localStorage.getItem(STORAGE_KEY));
  } catch {
    return undefined;
  }
}

function browserLanguage(): AppLanguage {
  const languages = typeof navigator === "undefined" ? [] : (navigator.languages ?? [navigator.language]);
  return languages.some((language) => language?.toLowerCase().startsWith("pl")) ? "pl" : "en";
}

/**
 * The interface language. The English text in the templates is the key: `t("Add receipt")` returns the Polish text when
 * the language is Polish and one is known, else the English text itself, so a missing translation is never blank.
 * Order of precedence: the saved preference (set by LanguageSyncService once signed in), then what was chosen on this
 * device, then the browser's language. This service has no dependencies on purpose: every template pipe uses it.
 */
@Injectable({ providedIn: "root" })
export class TranslationService {
  /** The language saved with the signed-in person's preferences. */
  public readonly saved = signal<AppLanguage | undefined>(undefined);

  private readonly chosen = signal<AppLanguage | undefined>(readStored());

  public readonly language = computed<AppLanguage>(() => this.saved() ?? this.chosen() ?? browserLanguage());

  constructor() {
    effect(() => {
      if (typeof document !== "undefined") {
        document.documentElement.lang = this.language();
      }
    });
  }

  public t(text: string, params?: Record<string, string | number>): string {
    const translated = this.language() === "pl" ? (PL[text] ?? text) : text;
    return params ? translated.replace(/\{(\w+)\}/g, (match, key) => String(params[key] ?? match)) : translated;
  }

  /** "1 item" / "3 items": the count with the noun in the right form (Polish has three: 1, 2-4, 5+). */
  public plural(count: number, singular: string, plural: string): string {
    if (this.language() === "pl" && PL_PLURALS[singular]) {
      const [one, few, many] = PL_PLURALS[singular];
      const lastTwo = count % 100;
      const last = count % 10;
      return count === 1 ? one : last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14) ? few : many;
    }
    return count === 1 ? singular : plural;
  }

  /** Translates the English month names inside a period label ("October 2026", "12 Oct – 18 Oct 2026"). */
  public months(text: string): string {
    return this.language() === "pl"
      ? text.replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g, (month) => PL[month] ?? month)
      : text;
  }

  /** Switches now and remembers the choice on this device. */
  public choose(language: AppLanguage): void {
    this.chosen.set(language);
    this.saved.set(undefined);
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // private mode: the saved preference carries it once signed in
    }
  }
}
