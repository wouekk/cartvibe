import { Dialog } from "@angular/cdk/dialog";
import { Component, provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { AppDialog } from "./app-dialog";

import type { MockInstance } from "vitest";
@Component({ standalone: true, template: `<input aria-label="Name" />` })
class FormDialogComponent {}

// jsdom has no layout, so the CDK's focus trap finds nothing focusable there; these pin what the wrapper asks the CDK
// for. Seen in a browser: without a fallback, focus stayed on the button that opened the dialog, behind the backdrop.
describe("AppDialog", () => {
  let openSpy: MockInstance;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    openSpy = vi.spyOn(TestBed.inject(Dialog), "open");
  });

  afterEach(() => TestBed.inject(Dialog).closeAll());

  it("moves focus into the dialog when the caller does not say where", () => {
    TestBed.inject(AppDialog).open(FormDialogComponent);

    expect(openSpy.mock.calls[0][1].autoFocus).toBe("first-tabbable");
  });

  it("keeps the focus target a caller asks for", () => {
    TestBed.inject(AppDialog).open(FormDialogComponent, { autoFocus: "dialog" });

    expect(openSpy.mock.calls[0][1].autoFocus).toBe("dialog");
  });
});
