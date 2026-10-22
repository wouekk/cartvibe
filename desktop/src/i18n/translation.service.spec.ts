import { TestBed } from "@angular/core/testing";
import { Dictionary } from "./languages/language";
import { readDictionary, readLanguageRegistry, registerRealLanguages } from "./i18n-test-utils";
import { TranslationService } from "./translation.service";

const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort().join();

describe("TranslationService", () => {
  let service: TranslationService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(TranslationService);
    registerRealLanguages(service);
  });

  it("is English until someone is signed in, whatever the browser says", () => {
    jest.spyOn(navigator, "languages", "get").mockReturnValue(["pl-PL", "pl"]);

    expect(service.language()).toBe("en");
    expect(service.t("Dashboard")).toBe("Dashboard");
  });

  it("returns the English text when the language is English", () => {
    service.choose("en");

    expect(service.t("Dashboard")).toBe("Dashboard");
  });

  it("returns the Polish text, and the English text for one that is missing", () => {
    service.choose("pl");

    expect(service.t("Dashboard")).toBe("Pulpit");
    expect(service.t("A sentence nobody translated")).toBe("A sentence nobody translated");
  });

  it("treats null and an empty string as missing", () => {
    service.register("pl", { messages: { Dashboard: null, Receipts: "", "Add receipt": "Dodaj paragon" } });
    service.choose("pl");

    expect(service.t("Dashboard")).toBe("Dashboard");
    expect(service.t("Receipts")).toBe("Receipts");
    expect(service.t("Add receipt")).toBe("Dodaj paragon");
  });

  it("shows English, not a key, when a language is chosen but its dictionary has not loaded", () => {
    service.setLanguages([...service.languages(), { code: "de", label: "Deutsch", locale: "de" }]);
    service.choose("de");

    expect(service.language()).toBe("de");
    expect(service.t("Dashboard")).toBe("Dashboard");
  });

  it("fills in parameters", () => {
    service.choose("pl");

    expect(service.t("Crossed off ({count})", { count: 3 })).toBe("Skreślone (3)");
    service.choose("en");
    expect(service.t("Crossed off ({count})", { count: 3 })).toBe("Crossed off (3)");
  });

  it("follows the account language and caches it for the next load", () => {
    service.adoptSaved("pl");

    expect(service.language()).toBe("pl");
    expect(localStorage.getItem("cartvibe.language")).toBe("pl");
  });

  it("goes back to English and clears the cache on logout", () => {
    service.adoptSaved("pl");
    service.forget();

    expect(service.language()).toBe("en");
    expect(localStorage.getItem("cartvibe.language")).toBeNull();
    expect(service.cachedLanguage()).toBeUndefined();
  });

  it("starts from the cached language of the signed-in account", () => {
    localStorage.setItem("cartvibe.language", "pl");
    TestBed.resetTestingModule();
    const fresh = TestBed.inject(TranslationService);
    registerRealLanguages(fresh);

    expect(fresh.language()).toBe("pl");
  });

  it("translates a message that already has its values in it by matching the {placeholder} keys", () => {
    service.choose("pl");

    expect(service.t("Delete Milk")).toBe("Usuń Milk");
    expect(service.t("Receipt update: Lidl")).toBe("Aktualizacja paragonu: Lidl");
  });

  it("translates stored data only when it is exactly a catalogue text", () => {
    service.register("pl", { messages: { "Spending by shop": "Wydatki według sklepu", "Delete {name}": "Usuń {name}" } });
    service.choose("pl");

    expect(service.data("Spending by shop")).toBe("Wydatki według sklepu");
    // A name someone typed is never matched against a {placeholder} pattern.
    expect(service.data("Delete Milk")).toBe("Delete Milk");
    expect(service.data("Our groceries")).toBe("Our groceries");
  });

  it("matches a sentence that uses a placeholder twice with a back reference", () => {
    service.register("pl", { messages: { "{a} is {a}, not {b}": "{a} to {a}, nie {b}" } });
    service.choose("pl");

    expect(service.t("x is x, not y")).toBe("x to x, nie y");
    expect(service.t("x is z, not y")).toBe("x is z, not y");
  });

  it("collects the texts that had no translation in a dev build", () => {
    service.choose("pl");
    window.__i18nMissing = undefined;

    service.t("Nobody translated this");

    expect(window.__i18nMissing?.has("Nobody translated this")).toBe(true);
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

  it("picks the plural form by the CLDR category of the language", () => {
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

  it("falls back to other, then to the English forms, when a plural category is missing", () => {
    service.register("pl", { messages: {}, plurals: { item: { one: "produkt", other: "produktu" }, list: { one: "lista" } } });
    service.choose("pl");

    expect(service.plural(3, "item", "items")).toBe("produktu");
    expect(service.plural(3, "list", "lists")).toBe("lists");
    expect(service.plural(1, "list", "lists")).toBe("lista");
  });

  it("formats dates in en-US for a language Angular has no locale data for", () => {
    service.setLanguages([...service.languages(), { code: "xx", label: "Xx", locale: "xx" }]);
    service.choose("xx");

    expect(service.locale()).toBe("en-US");
  });

  it("lists every registered language in the menu, with unique codes", () => {
    const codes = service.languages().map((language) => language.code);

    expect(codes).toEqual(readLanguageRegistry().map((language) => language.code));
    expect(new Set(codes).size).toBe(codes.length);
  });

  describe.each(readLanguageRegistry().filter((language) => language.code !== "en"))("language $code", (language) => {
    const dictionary: Dictionary = readDictionary(language.code);

    it("keeps the same {placeholders} as the English text in every message", () => {
      for (const [english, translated] of Object.entries(dictionary.messages)) {
        if (translated) {
          expect(placeholders(translated)).toBe(placeholders(english));
        }
      }
    });

    it("has exactly the plural categories its rule can return", () => {
      const categories = new Intl.PluralRules(language.locale).resolvedOptions().pluralCategories.slice().sort();
      for (const forms of Object.values(dictionary.plurals ?? {})) {
        expect(Object.keys(forms).sort()).toEqual(categories.includes("other") ? categories : [...categories, "other"].sort());
      }
    });
  });
});
