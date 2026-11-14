import { HttpContext } from "@angular/common/http";
import { provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { of, throwError } from "rxjs";
import { QUIET_ERRORS } from "../../interceptors/http-interceptor";
import { AiUsageMonth, ReceiptProcessingSettingsService } from "../../open-api";
import { ViewportService } from "../../services/viewport.service";
import { AiUsageCardComponent } from "./ai-usage-card.component";

describe("AiUsageCardComponent", () => {
  let fixture: ComponentFixture<AiUsageCardComponent>;
  let getAiUsage: ReturnType<typeof vi.fn>;
  const isHandset = signal(false);

  beforeEach(() => isHandset.set(false));

  const create = async (answer: AiUsageMonth[] | Error): Promise<void> => {
    getAiUsage = vi.fn(() => (answer instanceof Error ? throwError(() => answer) : of(answer)));
    await TestBed.configureTestingModule({
      imports: [AiUsageCardComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ReceiptProcessingSettingsService, useValue: { getAiUsage } },
        { provide: ViewportService, useValue: { isHandset } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AiUsageCardComponent);
    await fixture.whenStable();
  };

  const rows = (): string[][] =>
    Array.from(fixture.nativeElement.querySelectorAll('[data-testid="ai-usage-row"]') as NodeListOf<HTMLElement>).map((row) =>
      Array.from(row.querySelectorAll("td")).map((cell) => (cell.textContent ?? "").trim())
    );

  it("lists each month and model with its reads and tokens, the provider by the name people know", async () => {
    await create([
      { month: "2026-11", aiType: "ANTHROPIC", model: "claude-opus-5-5", calls: 12, inputTokens: 34567, outputTokens: 8901 },
      { month: "2026-10", aiType: "OLLAMA", model: "llama3.2-vision", calls: 3, inputTokens: 900, outputTokens: 40 },
    ]);

    expect(getAiUsage).toHaveBeenCalledTimes(1);
    expect(rows()).toEqual([
      ["November 2026", "Claude · claude-opus-5-5", "12", "34,567", "8,901"],
      ["October 2026", "Ollama · llama3.2-vision", "3", "900", "40"],
    ]);
  });

  it("lists the rows as cards on a phone, with the same numbers under their names", async () => {
    isHandset.set(true);
    await create([{ month: "2026-10", aiType: "OLLAMA", model: "llama3.2-vision", calls: 3, inputTokens: 900, outputTokens: 40 }]);

    expect(fixture.nativeElement.querySelector('[data-testid="ai-usage-table"]')).toBeNull();
    const card: HTMLElement = fixture.nativeElement.querySelector('[data-testid="ai-usage-cards"] [data-testid="ai-usage-row"]');
    expect(card.textContent).toContain("Ollama · llama3.2-vision");
    expect(card.textContent).toContain("October 2026");
    const figures = Array.from(card.querySelectorAll("dl > div")).map((pair) => [
      (pair.querySelector("dt")?.textContent ?? "").trim(),
      (pair.querySelector("dd")?.textContent ?? "").trim(),
    ]);
    expect(figures).toEqual([
      ["Reads", "3"],
      ["Tokens sent", "900"],
      ["Tokens written", "40"],
    ]);
  });

  it("shows no card until something was read", async () => {
    await create([]);

    expect(fixture.nativeElement.querySelector('[data-testid="ai-card-usage"]')).toBeNull();
  });

  it("shows no card, and no error, when the numbers cannot be loaded", async () => {
    await create(new Error("offline"));

    expect(fixture.nativeElement.querySelector('[data-testid="ai-card-usage"]')).toBeNull();
  });

  describe("the model the main AI is set to", () => {
    // The server counts in UTC days, so the running month is UTC's.
    const thisMonth = new Date().toISOString().slice(0, 7);
    const inUseRows = (): boolean[] =>
      Array.from(fixture.nativeElement.querySelectorAll('[data-testid="ai-usage-row"]') as NodeListOf<HTMLElement>).map(
        (row) => row.querySelector('[data-testid="ai-usage-in-use"]') !== null
      );
    const models = (): string[] => rows().map((cells) => cells[1].replace(/\s+/g, " "));

    it("has a row from the moment it is saved, with zeros until it has answered", async () => {
      await create([{ month: thisMonth, aiType: "GEMINI", model: "gemini-old", calls: 17, inputTokens: 44436, outputTokens: 39278 }]);

      fixture.componentRef.setInput("inUse", { aiType: "GEMINI", model: "gemini-new" });
      await fixture.whenStable();

      expect(models()).toEqual(["Gemini · gemini-new In use", "Gemini · gemini-old"]);
      expect(rows()[0].slice(2)).toEqual(["0", "0", "0"]);
      expect(inUseRows()).toEqual([true, false]);
    });

    it("is marked on its own row once it has answered, with no second row", async () => {
      await create([
        { month: thisMonth, aiType: "GEMINI", model: "gemini-new", calls: 2, inputTokens: 300, outputTokens: 80 },
        { month: thisMonth, aiType: "GEMINI", model: "gemini-old", calls: 17, inputTokens: 44436, outputTokens: 39278 },
        { month: "2020-01", aiType: "GEMINI", model: "gemini-new", calls: 5, inputTokens: 10, outputTokens: 10 },
      ]);

      fixture.componentRef.setInput("inUse", { aiType: "GEMINI", model: "gemini-new" });
      await fixture.whenStable();

      // Only the running month's row says so: an older month is history.
      expect(inUseRows()).toEqual([true, false, false]);
      expect(rows()[0].slice(2)).toEqual(["2", "300", "80"]);
    });

    it("shows the card for a saved AI that has read nothing yet", async () => {
      await create([]);

      fixture.componentRef.setInput("inUse", { aiType: "ANTHROPIC", model: "claude-opus-5-5" });
      await fixture.whenStable();

      expect(models()).toEqual(["Claude · claude-opus-5-5 In use"]);
    });

    it("has no row while the AI has no model", async () => {
      await create([]);

      fixture.componentRef.setInput("inUse", { aiType: "GEMINI", model: "" });
      await fixture.whenStable();

      expect(fixture.nativeElement.querySelector('[data-testid="ai-card-usage"]')).toBeNull();
    });
  });

  it("reads the numbers again when asked, quietly, and keeps what it showed when that fails", async () => {
    await create([{ month: "2026-10", aiType: "OLLAMA", model: "llama3.2-vision", calls: 3, inputTokens: 900, outputTokens: 40 }]);
    expect((getAiUsage.mock.calls[0][2].context as HttpContext).get(QUIET_ERRORS)).toBe(true);

    getAiUsage.mockReturnValueOnce(
      of([{ month: "2026-10", aiType: "OLLAMA", model: "llama3.2-vision", calls: 4, inputTokens: 1200, outputTokens: 55 }])
    );
    fixture.componentInstance.reload();
    await fixture.whenStable();
    expect(rows()).toEqual([["October 2026", "Ollama · llama3.2-vision", "4", "1,200", "55"]]);

    getAiUsage.mockReturnValueOnce(throwError(() => new Error("offline")));
    fixture.componentInstance.reload();
    await fixture.whenStable();
    expect(getAiUsage).toHaveBeenCalledTimes(3);
    expect(rows()).toEqual([["October 2026", "Ollama · llama3.2-vision", "4", "1,200", "55"]]);
  });
});
