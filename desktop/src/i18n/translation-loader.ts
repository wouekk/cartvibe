import { HttpBackend, HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { firstValueFrom } from "rxjs";
import { Dictionary, ENGLISH, LanguageEntry } from "./languages/language";
import { AppLanguage, TranslationService } from "./translation.service";

const BASE = "assets/i18n";

function isLanguageEntry(value: unknown): value is LanguageEntry {
  const entry = value as LanguageEntry;
  return !!entry && typeof entry.code === "string" && typeof entry.label === "string" && typeof entry.locale === "string" && /^[a-z]{2,3}(-[a-z0-9]+)*$/i.test(entry.code);
}

function isDictionary(value: unknown): value is Dictionary {
  const dictionary = value as Dictionary;
  return !!dictionary && typeof dictionary.messages === "object" && dictionary.messages !== null && !Array.isArray(dictionary.messages);
}

/**
 * Fetches the language registry and the dictionaries. It talks through `HttpBackend`, which skips the app's interceptors,
 * so a missing file never shows the error toast and never triggers a token refresh. Nothing here can break the app: a
 * file that fails to load leaves the interface in English.
 */
@Injectable({ providedIn: "root" })
export class TranslationLoader {
  private readonly http = new HttpClient(inject(HttpBackend));

  private readonly translation = inject(TranslationService);

  private readonly pending = new Map<string, Promise<boolean>>();

  /** Loads the registry and, so the first render is already translated, the cached language of the signed-in account. */
  public async initialize(): Promise<void> {
    await this.loadRegistry();
    const cached = this.translation.cachedLanguage();
    if (cached) {
      await this.ensure(cached);
    }
  }

  public async loadRegistry(): Promise<void> {
    try {
      const raw = await firstValueFrom(this.http.get<unknown>(`${BASE}/languages.json`));
      const languages = Array.isArray(raw) ? raw.filter(isLanguageEntry).map((entry) => ({ ...entry, code: entry.code.toLowerCase() })) : [];
      // English is the key, so it is always there and always first (the fallback).
      this.translation.setLanguages([ENGLISH, ...languages.filter((language) => language.code !== ENGLISH.code)]);
    } catch (error) {
      console.warn("Could not load the language list; the interface stays in English.", error);
    }
  }

  /** Loads a language's dictionary once. Resolves true when the language can be shown. */
  public ensure(code: AppLanguage | undefined): Promise<boolean> {
    if (!code || this.translation.isRegistered(code)) {
      return Promise.resolve(true);
    }

    let load = this.pending.get(code);
    if (!load) {
      load = this.fetch(code).finally(() => this.pending.delete(code));
      this.pending.set(code, load);
    }

    return load;
  }

  private async fetch(code: AppLanguage): Promise<boolean> {
    try {
      // The code comes from the registry, which only accepts letters, digits and hyphens.
      const dictionary = await firstValueFrom(this.http.get<unknown>(`${BASE}/${encodeURIComponent(code)}.json`));
      if (!isDictionary(dictionary)) {
        throw new Error("not a dictionary");
      }

      this.translation.register(code, dictionary);
      return true;
    } catch (error) {
      console.warn(`Could not load the "${code}" translations; the interface stays in English.`, error);
      return false;
    }
  }
}
