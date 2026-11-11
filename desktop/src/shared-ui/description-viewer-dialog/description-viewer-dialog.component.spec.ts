import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import type { Mock } from "vitest";
import { APP_DIALOG_DATA, AppDialogRef } from "../../dialog/app-dialog";
import { SharedUiModule } from "../shared-ui.module";
import { DescriptionViewerDialogComponent, DescriptionViewerDialogData } from "./description-viewer-dialog.component";

describe("DescriptionViewerDialogComponent", () => {
  let fixture: ComponentFixture<DescriptionViewerDialogComponent>;
  let dialogRef: { close: Mock };

  const open = async (data: DescriptionViewerDialogData) => {
    dialogRef = { close: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [SharedUiModule],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AppDialogRef, useValue: dialogRef },
        { provide: APP_DIALOG_DATA, useValue: data },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(DescriptionViewerDialogComponent);
    await fixture.whenStable();
  };

  const page = (): HTMLElement => fixture.nativeElement;

  it("is headed Description unless the caller names it", async () => {
    await open({ description: "plain" });
    expect(page().querySelector("h2")?.textContent).toBe("Description");

    TestBed.resetTestingModule();
    await open({ description: "plain", headerText: "Task result" });
    expect(page().querySelector("h2")?.textContent).toBe("Task result");
  });

  it("lays out a JSON description with its keys and values", async () => {
    await open({ description: JSON.stringify({ status: "FAILED", attempts: 3 }) });

    expect(page().textContent).toContain("status");
    expect(page().textContent).toContain("FAILED");
    expect(page().textContent).toContain("3");
  });

  it("shows a plain-text description as it is", async () => {
    await open({ description: "Gemini answered 429: quota exceeded" });

    expect(page().textContent).toContain("Gemini answered 429: quota exceeded");
  });

  it("never turns markup in a description into elements", async () => {
    const hostile = '<img src=x onerror="window.__pwned=1">';
    await open({ description: JSON.stringify({ error: hostile }) });
    expect(page().querySelector("img")).toBeNull();

    TestBed.resetTestingModule();
    await open({ description: hostile });
    expect(page().querySelector("img[onerror]")).toBeNull();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it("copies the raw description and closes on Close", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await open({ description: '{"a":1}' });

    const buttons = [...page().querySelectorAll("button")] as HTMLButtonElement[];
    const copy = buttons.find((button) => button.getAttribute("aria-label") === "Copy description") ?? buttons[0];
    copy.click();
    await fixture.whenStable();
    expect(writeText).toHaveBeenCalledWith('{"a":1}');

    buttons.find((button) => button.textContent?.includes("Close"))!.click();
    expect(dialogRef.close).toHaveBeenCalled();
  });
});
