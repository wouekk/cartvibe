/** Vitest stand-in for Chart.js, which needs a real canvas; the specs assert the configuration handed to it instead. */
export class ChartStub {
  /** Every chart built since the last reset, so a spec can read the config the wrapper passed. */
  public static readonly instances: ChartStub[] = [];

  public static register(): void {}

  public data: unknown;

  /** Like Chart.js, `options` is the config's own object (the real one is a proxy over it, which calls functions). */
  public get options(): Record<string, unknown> {
    return this.config.options;
  }

  public set options(options: Record<string, unknown>) {
    this.config.options = options;
  }

  public tooltip = { setActiveElements: (): void => {} };

  private active: { datasetIndex: number; index: number }[] = [];

  /** The mode of every `update()` call, in order (`undefined` is the default, animated one). */
  public readonly updates: (string | undefined)[] = [];

  public destroyed = false;

  constructor(public readonly canvas: HTMLCanvasElement, public readonly config: { type: string; data: unknown; options: Record<string, unknown>; plugins?: unknown[] }) {
    this.data = config.data;
    ChartStub.instances.push(this);
  }

  public getActiveElements(): { datasetIndex: number; index: number }[] {
    return this.active;
  }

  public setActiveElements(active: { datasetIndex: number; index: number }[]): void {
    this.active = active;
  }

  public update(mode?: string): void {
    this.updates.push(mode);
  }

  public destroy(): void {
    this.destroyed = true;
  }
}

/** The registrable pieces `chart-lazy.ts` imports; they are never drawn. */
export class ChartPieceStub {}
