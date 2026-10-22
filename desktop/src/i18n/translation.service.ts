import { getLocaleId } from "@angular/common";
import { computed, effect, Injectable, isDevMode, signal } from "@angular/core";
import "./locale-data";
import { Dictionary, ENGLISH, LanguageEntry } from "./languages/language";

export type AppLanguage = string;

const STORAGE_KEY = "cartvibe.language";

/** The en-US data is built into Angular; every other locale needs `locale-data.ts`. */
const FALLBACK_LOCALE = "en-US";

declare global {
  interface Window {
    /** Dev builds only: the English texts that were looked up in a non-English language and had no translation. */
    __i18nMissing?: Set<string>;
  }
}

function readCached(): string | undefined {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

interface InterpolationPattern {
  regex: RegExp;
  translated: string;
  /** Length of the fixed text: the longer, the more specific the message. */
  fixed: number;
}

const patternCache = new WeakMap<Dictionary, InterpolationPattern[]>();

/** A value counts as translated only when it is a non-empty string; `null` and `""` fall back to English. */
function translatedValue(value: string | null | undefined): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** The messages with {placeholders} as anchored regular expressions, the most specific first. */
function interpolationPatterns(dictionary: Dictionary): InterpolationPattern[] {
  let patterns = patternCache.get(dictionary);
  if (!patterns) {
    patterns = Object.entries(dictionary.messages)
      .filter(([english, translated]) => /\{\w+\}/.test(english) && translatedValue(translated))
      .map(([english, translated]) => {
        // A placeholder used twice in one sentence must match the same text again, so the second one is a back reference.
        const seen = new Set<string>();
        const source = english
          .split(/(\{\w+\})/)
          .map((part) => {
            if (!/^\{\w+\}$/.test(part)) {
              return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            }
            const name = part.slice(1, -1);
            if (seen.has(name)) {
              return `\\k<${name}>`;
            }
            seen.add(name);
            return `(?<${name}>.+?)`;
          })
          .join("");
        return { regex: new RegExp(`^${source}$`, "s"), translated: translated as string, fixed: english.replace(/\{\w+\}/g, "").length };
      })
      .sort((a, b) => b.fixed - a.fixed);
    patternCache.set(dictionary, patterns);
  }

  return patterns;
}

const MONTH_NAMES = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g;

/**
 * The interface language. The English text in the templates is the key: `t("Add receipt")` returns the active language's
 * text when it has one, else the English text itself, so a missing translation is never blank. Languages are data
 * (`assets/i18n/languages.json` and one `<code>.json` each, loaded by `TranslationLoader`); this service knows none of
 * them by name.
 * The language is never taken from the browser. It is English until a person is signed in, then the one saved with their
 * account (`UserPreferences.language`, set by LanguageSyncService). `localStorage` only caches the signed-in account's
 * language so a reload does not flash English; it is cleared on logout.
 * It has no dependencies on purpose: every template pipe uses it.
 */
@Injectable({ providedIn: "root" })
export class TranslationService {
  /** The languages the interface offers, from the registry (`languages.json`). English until the registry is loaded. */
  public readonly languages = signal<LanguageEntry[]>([ENGLISH]);

  /** The language saved with the signed-in person's preferences. */
  public readonly saved = signal<AppLanguage | undefined>(undefined);

  private readonly dictionaries = signal<Record<string, Dictionary>>({});

  private readonly cached = signal<string | undefined>(readCached());

  public readonly language = computed<AppLanguage>(() => this.entry().code);

  private readonly entry = computed<LanguageEntry>(() => {
    const languages = this.languages();
    const wanted = (this.saved() ?? this.cached() ?? "").toLowerCase();
    return languages.find((language) => language.code === wanted) ?? languages[0] ?? ENGLISH;
  });

  private readonly dictionary = computed<Dictionary | undefined>(() => this.dictionaries()[this.entry().code]);

  /** The locale dates are formatted with for the active language; en-US when Angular has no data for it. */
  public readonly locale = computed(() => {
    const locale = this.entry().locale;
    try {
      getLocaleId(locale);
      return locale;
    } catch {
      return FALLBACK_LOCALE;
    }
  });

  private readonly pluralRules = computed(() => {
    try {
      return new Intl.PluralRules(this.locale());
    } catch {
      return new Intl.PluralRules(FALLBACK_LOCALE);
    }
  });

  constructor() {
    effect(() => {
      if (typeof document !== "undefined") {
        document.documentElement.lang = this.language();
      }
    });
  }

  /** The registry's code for a value, else undefined. */
  public asLanguage(value: unknown): AppLanguage | undefined {
    const wanted = typeof value === "string" ? value.toLowerCase() : "";
    return this.languages().find((language) => language.code === wanted)?.code;
  }

  public setLanguages(languages: LanguageEntry[]): void {
    this.languages.set(languages);
  }

  /** Makes a language's texts available. Switching to it is a separate step, so the interface changes once. */
  public register(code: AppLanguage, dictionary: Dictionary): void {
    this.dictionaries.update((all) => ({ ...all, [code]: dictionary }));
  }

  public isRegistered(code: AppLanguage): boolean {
    return code === ENGLISH.code || code in this.dictionaries();
  }

  public t(text: string, params?: Record<string, string | number | null | undefined>): string {
    const dictionary = this.dictionary();
    const translated = (dictionary && (translatedValue(dictionary.messages[text]) ?? this.translateInterpolated(dictionary, text))) ?? this.missing(text);
    return params ? translated.replace(/\{(\w+)\}/g, (match, key) => String(params[key] ?? match)) : translated;
  }

  /**
   * A text that came from stored data, such as a starter report's title: it reads in the language only when it is
   * exactly a catalogue text, and anything a person typed is returned as written. Unlike `t` it never matches a
   * {placeholder} pattern ("Delete Milk" stays as typed) and never counts as missing. The API's `Translator.Data` follows
   * the same rule, so the builder and the generated report agree.
   */
  public data(text: string): string {
    const dictionary = this.dictionary();
    return (dictionary && translatedValue(dictionary.messages[text])) ?? text;
  }

  /** English, and in a dev build a note of the text for spot checks (`window.__i18nMissing`). */
  private missing(text: string): string {
    if (isDevMode() && typeof window !== "undefined" && this.entry().code !== ENGLISH.code) {
      (window.__i18nMissing ??= new Set()).add(text);
    }

    return text;
  }

  /**
   * A message built with its values already in it ("Delete Milk", from `Delete ${name}`) has no key of its own, so it is
   * matched against the messages that carry {placeholders} ("Delete {name}") and the captured values are carried over.
   */
  private translateInterpolated(dictionary: Dictionary, text: string): string | undefined {
    for (const pattern of interpolationPatterns(dictionary)) {
      const match = pattern.regex.exec(text);
      if (match) {
        return pattern.translated.replace(/\{(\w+)\}/g, (placeholder, name) => match.groups?.[name] ?? placeholder);
      }
    }

    return undefined;
  }

  /** "1 item" / "3 items": the noun for a count, in the language's own CLDR plural forms when it has them. */
  public plural(count: number, singular: string, plural: string): string {
    const forms = this.dictionary()?.plurals?.[singular];
    if (forms) {
      const form = translatedValue(forms[this.pluralRules().select(count)]) ?? translatedValue(forms.other);
      if (form) {
        return form;
      }
    }

    return count === 1 ? singular : plural;
  }

  /** Translates the English month names inside a period label ("October 2026", "12 Oct – 18 Oct 2026"). */
  public months(text: string): string {
    const messages = this.dictionary()?.messages;
    return messages ? text.replace(MONTH_NAMES, (month) => translatedValue(messages[month]) ?? month) : text;
  }

  /** Switches now and caches the choice on this device (the account's copy is saved by LanguageSyncService). */
  public choose(language: AppLanguage): void {
    const code = this.asLanguage(language);
    if (!code) {
      return;
    }

    this.saved.set(undefined);
    this.remember(code);
  }

  /** Follows the signed-in account's language (or none), and caches it. */
  public adoptSaved(code: AppLanguage | undefined): void {
    this.saved.set(code);
    if (code) {
      this.remember(code);
    }
  }

  /** Signed out: back to English and forget the cache, so the login page is English. */
  public forget(): void {
    this.saved.set(undefined);
    this.cached.set(undefined);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // nothing to clear
    }
  }

  /** The cached language of the last signed-in account, to be preloaded before the first render. */
  public cachedLanguage(): AppLanguage | undefined {
    return this.asLanguage(this.cached());
  }

  private remember(code: AppLanguage): void {
    this.cached.set(code);
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // private mode: the saved preference carries it once signed in
    }
  }
}
