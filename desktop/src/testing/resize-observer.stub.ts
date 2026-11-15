/**
 * A ResizeObserver a spec can drive (jsdom lays nothing out, so nothing ever resizes by itself): `watchResizes()`
 * in `beforeEach`, `restoreResizes()` in `afterEach`, and `observedResizes()` lists every element something is
 * watching, each with `resize(...)` to give it a size and tell its watcher.
 */
export interface ObservedElement {
  element: Element;
  /** Sets the given measurements on the element (`scrollHeight`, `clientHeight`, …) and calls the watcher. */
  resize(measurements: Record<string, number>): void;
  /** False once the watcher has let go of the element. */
  watched(): boolean;
}

let observed: ObservedElement[] = [];

export function watchResizes(): void {
  observed = [];

  class ResizeObserverStub {
    private readonly elements = new Set<Element>();

    constructor(private readonly callback: ResizeObserverCallback) {}

    public observe(element: Element): void {
      this.elements.add(element);
      observed.push({
        element,
        resize: (measurements) => {
          for (const [name, value] of Object.entries(measurements)) {
            Object.defineProperty(element, name, { configurable: true, value });
          }
          this.callback([], this as unknown as ResizeObserver);
        },
        watched: () => this.elements.has(element),
      });
    }

    public unobserve(element: Element): void {
      this.elements.delete(element);
    }

    public disconnect(): void {
      this.elements.clear();
    }
  }

  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
}

export function observedResizes(): ObservedElement[] {
  return observed;
}

export function restoreResizes(): void {
  vi.unstubAllGlobals();
  observed = [];
}
