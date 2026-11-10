import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { of, throwError } from "rxjs";
import { AiUsageMonth, ReceiptProcessingSettingsService } from "../../open-api";
import { AiUsageCardComponent } from "./ai-usage-card.component";

describe("AiUsageCardComponent", () => {
  let fixture: ComponentFixture<AiUsageCardComponent>;
  let getAiUsage: ReturnType<typeof vi.fn>;

  const create = async (answer: AiUsageMonth[] | Error): Promise<void> => {
    getAiUsage = vi.fn(() => (answer instanceof Error ? throwError(() => answer) : of(answer)));
    await TestBed.configureTestingModule({
      imports: [AiUsageCardComponent],
      providers: [provideZonelessChangeDetection(), { provide: ReceiptProcessingSettingsService, useValue: { getAiUsage } }],
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

  it("shows no card until something was read", async () => {
    await create([]);

    expect(fixture.nativeElement.querySelector('[data-testid="ai-card-usage"]')).toBeNull();
  });

  it("shows no card, and no error, when the numbers cannot be loaded", async () => {
    await create(new Error("offline"));

    expect(fixture.nativeElement.querySelector('[data-testid="ai-card-usage"]')).toBeNull();
  });
});
