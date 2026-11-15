import { Component, provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { observedResizes, restoreResizes, watchResizes } from "../testing/resize-observer.stub";
import { ClippedDirective } from "./clipped.directive";

@Component({
  standalone: true,
  imports: [ClippedDirective],
  template: `<p appClipped #text="appClipped" data-testid="text">Text</p><span data-testid="clipped">{{ text.clipped() }}</span>`,
})
class HostComponent {}

describe("ClippedDirective", () => {
  let fixture: ComponentFixture<HostComponent>;
  const said = (): string => fixture.nativeElement.querySelector('[data-testid="clipped"]').textContent;

  beforeEach(async () => {
    watchResizes();
    await TestBed.configureTestingModule({ imports: [HostComponent], providers: [provideZonelessChangeDetection()] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
  });

  afterEach(() => restoreResizes());

  it("says nothing is cut while the text fits its box", async () => {
    observedResizes()[0].resize({ scrollHeight: 60, clientHeight: 60 });
    await fixture.whenStable();

    expect(said()).toBe("false");
  });

  it("says the text is cut once it is taller than its box, and keeps saying so with the clamp off", async () => {
    const text = observedResizes()[0];
    text.resize({ scrollHeight: 120, clientHeight: 60 });
    await fixture.whenStable();
    expect(said()).toBe("true");

    // Shown in full: nothing is cut any more, and the button that puts the clamp back must stay.
    text.resize({ scrollHeight: 120, clientHeight: 120 });
    await fixture.whenStable();
    expect(said()).toBe("true");
  });

  it("stops watching when it is destroyed", () => {
    const text = observedResizes()[0];

    fixture.destroy();

    expect(text.watched()).toBe(false);
  });
});
