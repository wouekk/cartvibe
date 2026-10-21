/** Jest stand-in for ApexCharts, which needs a real SVG layout engine; the specs assert the options instead. */
export default class ApexChartsStub {
  constructor(public readonly el: HTMLElement, public readonly options: unknown) {}

  public render(): Promise<void> {
    return Promise.resolve();
  }

  public updateOptions(): Promise<void> {
    return Promise.resolve();
  }

  public destroy(): void {}
}
