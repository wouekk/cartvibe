import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { FormControl } from "@angular/forms";
import { GROUP_COLORS, GROUP_ICONS } from "../../constants/group-look";
import { GroupLookPickerComponent } from "./group-look-picker.component";

describe("GroupLookPickerComponent", () => {
  let fixture: ComponentFixture<GroupLookPickerComponent>;
  let icon: FormControl<string | null>;
  let color: FormControl<string | null>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GroupLookPickerComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    icon = new FormControl<string | null>("");
    color = new FormControl<string | null>("teal");
    fixture = TestBed.createComponent(GroupLookPickerComponent);
    fixture.componentRef.setInput("iconControl", icon);
    fixture.componentRef.setInput("colorControl", color);
    fixture.componentRef.setInput("name", "kowalscy");
    await fixture.whenStable();
  });

  const byTestId = (id: string): HTMLButtonElement => fixture.nativeElement.querySelector(`[data-testid="${id}"]`);

  it("offers every icon and colour plus a default, each a labelled toggle button", () => {
    const iconButtons = fixture.nativeElement.querySelectorAll('[data-testid="group-icon-picker"] button');
    const colorButtons = fixture.nativeElement.querySelectorAll('[data-testid="group-color-picker"] button');

    expect(iconButtons.length).toBe(GROUP_ICONS.length + 1);
    expect(colorButtons.length).toBe(GROUP_COLORS.length + 1);
    for (const button of [...iconButtons, ...colorButtons] as HTMLButtonElement[]) {
      expect(button.getAttribute("aria-label")).toBeTruthy();
      expect(button.getAttribute("aria-pressed")).toMatch(/true|false/);
      expect(button.classList).toContain("min-h-11");
    }
    expect(byTestId("group-icon-none").textContent?.trim()).toBe("K");
  });

  it("orders the colours as a gradient: the neutrals, then round the wheel, with every theme palette in it", () => {
    const keys = GROUP_COLORS.map((choice) => choice.key);

    expect(keys.slice(0, 3)).toEqual(["zinc", "slate", "red"]);
    expect(keys.at(-1)).toBe("rose");
    for (const palette of ["zinc", "blue", "indigo", "emerald", "violet"]) {
      expect(keys).toContain(palette);
    }
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('[data-testid="group-color-picker"] button')) as HTMLElement[];
    expect(buttons.map((button) => button.dataset["testid"])).toEqual(["group-color-none", ...keys.map((key) => `group-color-${key}`)]);
  });

  it("marks the stored choice as pressed", () => {
    expect(byTestId("group-icon-none").getAttribute("aria-pressed")).toBe("true");
    expect(byTestId("group-color-teal").getAttribute("aria-pressed")).toBe("true");
    expect(byTestId("group-color-none").getAttribute("aria-pressed")).toBe("false");
  });

  it("picking sets the control, dirties the form and moves the pressed state", async () => {
    byTestId("group-icon-dog").click();
    byTestId("group-color-none").click();
    await fixture.whenStable();

    expect(icon.value).toBe("dog");
    expect(icon.dirty).toBe(true);
    expect(color.value).toBe("");
    expect(byTestId("group-icon-dog").getAttribute("aria-pressed")).toBe("true");
    expect(byTestId("group-color-teal").getAttribute("aria-pressed")).toBe("false");
  });

  it("changes nothing while read-only", async () => {
    fixture.componentRef.setInput("readonly", true);
    await fixture.whenStable();

    expect(byTestId("group-icon-dog").disabled).toBe(true);
    fixture.componentInstance.pickIcon("dog");
    expect(icon.value).toBe("");
  });

  it("moves the focus through a grid with the arrow keys", () => {
    const first = byTestId("group-icon-none");
    first.focus();
    first.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));

    expect(document.activeElement).toBe(byTestId("group-icon-home"));

    byTestId("group-icon-home").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(document.activeElement).toBe(first);
  });
});
