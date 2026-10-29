// The Angular unit-test builder initialises the TestBed (zoneless) before this file runs.

// jsdom does not implement HTMLCanvasElement.getContext; code that draws on a canvas calls it
// during component initialization, which spams console.error in otherwise
// passing test runs. Returning null matches the no-op behavior callers
// tolerate under jsdom.
HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as any;

// jsdom has no ResizeObserver; spartan's select and popover primitives observe their trigger's size.
if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    public observe(): void {}
    public unobserve(): void {}
    public disconnect(): void {}
  };
}

// ApexCharts needs a real SVG layout engine; the specs assert the options passed to this stand-in instead.
vi.mock('apexcharts', async () => ({ default: (await import('./src/testing/apexcharts.stub')).default }));
