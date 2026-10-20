import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ACCENT_STORAGE_KEY, AccentPickerComponent } from "./accent-picker.component";

describe("AccentPickerComponent", () => {
  let fixture: ComponentFixture<AccentPickerComponent>;
  let component: AccentPickerComponent;

  const dot = (key: string): HTMLButtonElement => fixture.nativeElement.querySelector(`[data-testid="accent-${key}"]`);

  const create = async (stored?: string) => {
    window.localStorage.clear();
    if (stored) {
      window.localStorage.setItem(ACCENT_STORAGE_KEY, stored);
    }
    await TestBed.configureTestingModule({
      imports: [AccentPickerComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(AccentPickerComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  };

  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-accent");
  });

  it("offers the four accents and starts on Ocean Blue", async () => {
    await create();

    expect(fixture.nativeElement.querySelectorAll("button").length).toBe(4);
    expect(dot("blue").getAttribute("aria-pressed")).toBe("true");
  });

  it("starts on the stored accent, and ignores a value it does not know", async () => {
    await create("indigo");
    expect(dot("indigo").getAttribute("aria-pressed")).toBe("true");

    TestBed.resetTestingModule();
    await create("pink");
    expect(dot("blue").getAttribute("aria-pressed")).toBe("true");
  });

  it("applies and remembers the picked accent", async () => {
    await create();

    dot("green").click();
    await fixture.whenStable();

    expect(document.documentElement.getAttribute("data-accent")).toBe("green");
    expect(window.localStorage.getItem(ACCENT_STORAGE_KEY)).toBe("green");
    expect(dot("green").getAttribute("aria-pressed")).toBe("true");
    expect(dot("blue").getAttribute("aria-pressed")).toBe("false");
    expect(component.active()).toBe("green");
  });
});
