import { Component, provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { NgxsModule } from "@ngxs/store";
import { AuthState } from "../../store/auth.state";
import { SystemSettingsState } from "../../store/system-settings.state";
import { MoneyComponent } from "./money.component";

@Component({
  standalone: true,
  imports: [MoneyComponent],
  template: `<span class="text-destructive"><app-money [value]="12.5"></app-money></span>`,
})
class TintedHostComponent {}

describe("MoneyComponent", () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TintedHostComponent, NgxsModule.forRoot([AuthState, SystemSettingsState])],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it("keeps the amount as one text, the whole part bold", async () => {
    const fixture = TestBed.createComponent(TintedHostComponent);
    await fixture.whenStable();

    const money: HTMLElement = fixture.nativeElement.querySelector("app-money");
    expect(money.textContent?.replace(/\s/g, "")).toContain("12");
    expect(money.querySelectorAll("[data-part=quiet]").length).toBe(2);
  });

  // Regression: the decimals of a red or amber amount stayed grey because the quiet parts set their own color.
  it("lets the symbol and the decimals take the amount's own color", async () => {
    const fixture = TestBed.createComponent(TintedHostComponent);
    await fixture.whenStable();

    const quiet: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll("app-money [data-part=quiet]"));
    for (const part of quiet) {
      const colorClasses = Array.from(part.classList).filter((name) => /^text-(?!\[)/.test(name));
      expect(colorClasses).toEqual([]);
    }
  });
});
