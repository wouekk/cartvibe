import { TestBed } from "@angular/core/testing";
import { PL } from "./pl";
import { TranslationService } from "./translation.service";

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

    expect(service.t("Dashboard")).toBe(PL["Dashboard"]);
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

  it("names the months of a period label in Polish", () => {
    service.choose("pl");

    expect(service.months("October 2026")).toBe("październik 2026");
    expect(service.months("12 Oct – 18 Oct 2026")).toBe("12 paź – 18 paź 2026");
  });

  it("has a Polish text for every key, with the same parameters as its English key", () => {
    for (const [english, polish] of Object.entries(PL)) {
      const params = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort().join();
      expect(params(polish)).toBe(params(english));
    }
  });
});
