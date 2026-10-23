import { setupZonelessTestEnv } from 'jest-preset-angular/setup-env/zoneless';

setupZonelessTestEnv();

// jsdom does not implement HTMLCanvasElement.getContext; code that draws on a canvas calls it
// during component initialization, which spams console.error in otherwise
// passing test runs. Returning null matches the no-op behavior callers
// tolerate under jsdom.
HTMLCanvasElement.prototype.getContext = jest.fn(() => null) as any;

// jsdom has no ResizeObserver; spartan's select and popover primitives observe their trigger's size.
if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    public observe(): void {}
    public unobserve(): void {}
    public disconnect(): void {}
  };
}
