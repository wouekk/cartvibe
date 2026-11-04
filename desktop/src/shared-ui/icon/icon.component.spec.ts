import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { AppIconComponent } from "./icon.component";
import { MATERIAL_TO_LUCIDE } from "./icon-map";

describe("AppIconComponent", () => {
  let fixture: ComponentFixture<AppIconComponent>;

  const draw = async (name: string | null | undefined): Promise<string> => {
    fixture.componentRef.setInput("name", name);
    await fixture.whenStable();
    return fixture.nativeElement.querySelector("svg")?.outerHTML ?? "";
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppIconComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(AppIconComponent);
  });

  it("is decorative to screen readers", async () => {
    await draw("receipt_long");

    expect(fixture.nativeElement.getAttribute("aria-hidden")).toBe("true");
  });

  it("draws nothing for an empty name", async () => {
    for (const name of ["", null, undefined]) {
      expect(await draw(name)).toBe("");
    }
    expect(fixture.nativeElement.querySelector("ng-icon")).toBeNull();
  });

  it("draws a different icon for different Material names", async () => {
    const receipt = await draw("receipt_long");
    const chevron = await draw("expand_more");

    expect(receipt).not.toBe("");
    expect(chevron).not.toBe("");
    expect(receipt).not.toBe(chevron);
  });

  it("draws the same fallback for any name it does not know", async () => {
    const first = await draw("no_such_icon");
    const second = await draw("another_unknown_one");

    expect(first).not.toBe("");
    expect(first).toBe(second);
    expect(first).not.toBe(await draw("receipt_long"));
  });

  it("can draw every mapped name (each Lucide icon is registered)", async () => {
    const failures: string[] = [];
    const fallback = await draw("no_such_icon");
    for (const [material, lucide] of Object.entries(MATERIAL_TO_LUCIDE)) {
      const svg = await draw(material);
      if (!svg || (lucide !== "lucideCircle" && svg === fallback)) {
        failures.push(`${material} -> ${lucide}`);
      }
    }

    expect(failures).toEqual([]);
  });
});
