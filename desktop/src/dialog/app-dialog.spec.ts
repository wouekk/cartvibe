import { Dialog } from "@angular/cdk/dialog";
import { GlobalPositionStrategy } from "@angular/cdk/overlay";
import { Component, provideZonelessChangeDetection, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { ViewportService } from "../services/viewport.service";
import { AppDialog } from "./app-dialog";

import type { MockInstance } from "vitest";
@Component({ standalone: true, template: `<input aria-label="Name" />` })
class FormDialogComponent {}

// jsdom has no layout, so the CDK's focus trap finds nothing focusable there; these pin what the wrapper asks the CDK
// for. Seen in a browser: without a fallback, focus stayed on the button that opened the dialog, behind the backdrop.
describe("AppDialog", () => {
  let openSpy: MockInstance;
  const isHandset = signal(false);

  beforeEach(() => {
    isHandset.set(false);
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: ViewportService, useValue: { isHandset } }],
    });
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

  describe("on a wider screen", () => {
    it("floats in the middle, with the sizes the caller asked for", () => {
      TestBed.inject(AppDialog).open(FormDialogComponent, { width: "50%", height: "80vh", panelClass: "mine" });

      const config = openSpy.mock.calls[0][1];
      expect(config.width).toBe("50%");
      expect(config.height).toBe("80vh");
      expect(config.maxWidth).toBe("calc(100vw - 2rem)");
      expect(config.positionStrategy).toBeUndefined();
      expect(config.panelClass).toEqual(["app-dialog-panel", "mine"]);
    });
  });

  describe("on a phone", () => {
    beforeEach(() => isHandset.set(true));

    it("is a sheet across the bottom of the screen, whatever sizes the caller asked for", () => {
      TestBed.inject(AppDialog).open(FormDialogComponent, { width: "50%", minWidth: "30rem", maxWidth: "40rem", height: "80vh" });

      const config = openSpy.mock.calls[0][1];
      expect(config.width).toBe("100vw");
      expect(config.minWidth).toBe("100vw");
      expect(config.maxWidth).toBe("100vw");
      // As tall as what it holds, never the whole screen: a strip of the page stays visible to tap out on.
      expect(config.height).toBeUndefined();
      expect(config.maxHeight).toBe("calc(100dvh - 3rem)");
      expect(config.positionStrategy).toBeInstanceOf(GlobalPositionStrategy);
    });

    it("carries the sheet's class beside the caller's own", () => {
      TestBed.inject(AppDialog).open(FormDialogComponent, { panelClass: ["mine", "too"] });

      expect(openSpy.mock.calls[0][1].panelClass).toEqual(["app-dialog-panel", "app-dialog-sheet", "mine", "too"]);
    });

    // Where it stands is the position strategy's doing and needs a layout to see: the demo's phone photographs
    // show it. Here: the opened panel is the sheet.
    it("opens as the sheet", () => {
      TestBed.inject(AppDialog).open(FormDialogComponent);

      expect(document.querySelector(".app-dialog-panel.app-dialog-sheet")).not.toBeNull();
    });

    it("still closes with a result and takes the focus target, like any dialog", () => {
      const ref = TestBed.inject(AppDialog).open<FormDialogComponent, unknown, string>(FormDialogComponent);
      const closed = vi.fn();
      ref.afterClosed().subscribe(closed);

      ref.close("done");

      expect(closed).toHaveBeenCalledWith("done");
      expect(openSpy.mock.calls[0][1].autoFocus).toBe("first-tabbable");
    });
  });
});
