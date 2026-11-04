import { Component, TemplateRef, provideZonelessChangeDetection, viewChild } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ToastHostComponent } from "./toast-host.component";
import { ToastService } from "./toast.service";

@Component({
  selector: "app-toast-template-host",
  standalone: true,
  imports: [ToastHostComponent],
  template: `
    <app-toast-host />
    <ng-template #undo><span data-testid="toast-template-body">Removed. <button type="button">Undo</button></span></ng-template>
  `,
})
class ToastTemplateHostComponent {
  public readonly undo = viewChild.required<TemplateRef<unknown>>("undo");
}

describe("ToastHostComponent", () => {
  let fixture: ComponentFixture<ToastTemplateHostComponent>;
  let toasts: ToastService;

  const toastElements = (): HTMLElement[] => [...fixture.nativeElement.querySelectorAll('[role="status"]')];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToastTemplateHostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    toasts = TestBed.inject(ToastService);
    fixture = TestBed.createComponent(ToastTemplateHostComponent);
    await fixture.whenStable();
  });

  afterEach(() => vi.useRealTimers());

  it("shows nothing until a toast is raised, inside a polite live region", () => {
    expect(toastElements()).toEqual([]);
    expect(fixture.nativeElement.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  it("shows a message with its kind, and a new toast replaces the last one", async () => {
    toasts.show("success", "Saved");
    await fixture.whenStable();
    expect(toastElements().length).toBe(1);
    expect(fixture.nativeElement.querySelector('[data-testid="toast-success"]')?.textContent).toContain("Saved");

    toasts.show("error", "Could not save");
    await fixture.whenStable();
    expect(toastElements().length).toBe(1);
    expect(fixture.nativeElement.querySelector('[data-testid="toast-success"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="toast-error"]')?.getAttribute("data-kind")).toBe("error");
  });

  it("closes when the dismiss button, labelled for screen readers, is pressed", async () => {
    toasts.show("info", "Synced");
    await fixture.whenStable();

    const dismiss = fixture.nativeElement.querySelector('[data-testid="toast-dismiss"]') as HTMLButtonElement;
    expect(dismiss.getAttribute("aria-label")).toBe("Dismiss");
    dismiss.click();
    await fixture.whenStable();

    expect(toastElements()).toEqual([]);
    expect(toasts.toasts()).toEqual([]);
  });

  it("closes by itself after its duration, and the ref closes it early", async () => {
    vi.useFakeTimers();
    toasts.show("info", "Gone soon", { duration: 3000 });
    fixture.detectChanges();
    expect(toastElements().length).toBe(1);

    vi.advanceTimersByTime(3000);
    fixture.detectChanges();
    expect(toastElements()).toEqual([]);

    const ref = toasts.show("error", "Stays until dismissed");
    fixture.detectChanges();
    vi.advanceTimersByTime(60_000);
    fixture.detectChanges();
    expect(toastElements().length).toBe(1);
    ref.dismiss();
    fixture.detectChanges();
    expect(toastElements()).toEqual([]);
  });

  it("an old toast's timer never closes the toast that replaced it", async () => {
    vi.useFakeTimers();
    toasts.show("info", "First", { duration: 1000 });
    toasts.show("success", "Second");
    vi.advanceTimersByTime(1000);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="toast-success"]')?.textContent).toContain("Second");
  });

  it("draws a template toast, buttons included", async () => {
    toasts.showTemplate(fixture.componentInstance.undo(), "info");
    await fixture.whenStable();

    const body = fixture.nativeElement.querySelector('[role="status"] [data-testid="toast-template-body"]');
    expect(body?.textContent).toContain("Removed.");
    expect(body?.querySelector("button")?.textContent).toBe("Undo");
  });
});
