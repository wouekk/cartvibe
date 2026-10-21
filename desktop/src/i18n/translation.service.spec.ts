import { TestBed } from "@angular/core/testing";
import { LANGUAGES } from "./languages";
import { POLISH } from "./languages/pl";
import { APP_LANGUAGES, TranslationService } from "./translation.service";

const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort().join();

describe("TranslationService", () => {
  let service: TranslationService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(TranslationService);
  });

  it("returns the English text when the language is English", () => {
    service.choose("en");

    expect(service.t("Dashboard")).toBe("Dashboard");
  });

  it("returns the Polish text, and the English text for one that is missing", () => {
    service.choose("pl");

    expect(service.t("Dashboard")).toBe(POLISH.messages["Dashboard"]);
    expect(service.t("A sentence nobody translated")).toBe("A sentence nobody translated");
  });

  it("fills in parameters", () => {
    service.choose("pl");

    expect(service.t("Crossed off ({count})", { count: 3 })).toBe("Skreślone (3)");
    service.choose("en");
    expect(service.t("Crossed off ({count})", { count: 3 })).toBe("Crossed off (3)");
  });

  it("prefers the saved preference over the device choice, and remembers the device choice", () => {
    service.choose("en");
    service.saved.set("pl");

    expect(service.language()).toBe("pl");
    expect(localStorage.getItem("cartvibe.language")).toBe("en");
  });

  it("translates a message that already has its values in it by matching the {placeholder} keys", () => {
    service.choose("pl");

    expect(service.t("Delete Milk")).toBe("Usuń Milk");
    expect(service.t("Receipt update: Lidl")).toBe("Aktualizacja paragonu: Lidl");
  });

  it("ignores a language the registry does not have", () => {
    service.choose("en");
    service.choose("xx");

    expect(service.language()).toBe("en");
  });

  it("names the months of a period label in the language", () => {
    service.choose("pl");

    expect(service.months("October 2026")).toBe("październik 2026");
    expect(service.months("12 Oct – 18 Oct 2026")).toBe("12 paź – 18 paź 2026");
  });

  it("picks the plural form by the language's own rule", () => {
    service.choose("pl");
    expect([1, 2, 5, 12, 22, 25].map((count) => service.plural(count, "item", "items"))).toEqual([
      "produkt",
      "produkty",
      "produktów",
      "produktów",
      "produkty",
      "produktów",
    ]);

    service.choose("en");
    expect([1, 2].map((count) => service.plural(count, "item", "items"))).toEqual(["item", "items"]);
  });

  it("lists every registered language in the menu, with unique codes", () => {
    expect(APP_LANGUAGES.map((language) => language.code)).toEqual(LANGUAGES.map((language) => language.code));
    expect(new Set(APP_LANGUAGES.map((language) => language.code)).size).toBe(APP_LANGUAGES.length);
  });

  describe.each(LANGUAGES.filter((language) => Object.keys(language.messages).length > 0))("language $code", (language) => {
    it("keeps the same {placeholders} as the English text in every message", () => {
      for (const [english, translated] of Object.entries(language.messages)) {
        expect(placeholders(translated)).toBe(placeholders(english));
      }
    });

    it("has as many forms for each noun as its plural rule can return", () => {
      for (const forms of Object.values(language.plurals ?? {})) {
        const highest = Math.max(...[0, 1, 2, 3, 4, 5, 11, 12, 21, 22, 25, 100].map((count) => language.pluralIndex?.(count) ?? (count === 1 ? 0 : 1)));
        expect(forms.length).toBeGreaterThan(highest);
      }
    });
  });
});
