import { Dictionary, LanguageEntry } from "./languages/language";
import { TranslationService } from "./translation.service";

const DIRECTORY = "src/assets/i18n";

/** Reads one of the real JSON files under `src/assets/i18n` (specs only; the app fetches them over HTTP). */
export function readI18nFile<T>(name: string): T {
  const fs = jest.requireActual("fs") as typeof import("fs");
  const path = jest.requireActual("path") as typeof import("path");
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), DIRECTORY, name), "utf8")) as T;
}

export function readLanguageRegistry(): LanguageEntry[] {
  return readI18nFile<LanguageEntry[]>("languages.json");
}

export function readDictionary(code: string): Dictionary {
  return readI18nFile<Dictionary>(`${code}.json`);
}

/** Registers the real registry and every real dictionary, as the app does after loading them. */
export function registerRealLanguages(service: TranslationService): void {
  const languages = readLanguageRegistry();
  service.setLanguages(languages);
  for (const language of languages.filter((entry) => entry.code !== "en")) {
    service.register(language.code, readDictionary(language.code));
  }
}
