/**
 * A stand-in for the shopping lists' live stream. The demo has one visitor and no server, so there is nothing to hear:
 * it never opens, and the app applies each of its own changes from the answer to the call, as it does with the real
 * stream. Without it the browser would keep asking a static file server for `/stream` and retrying.
 */
export class DemoEventSource {
  public readonly readyState = 1;

  public addEventListener(): void {
    // Nothing to listen for.
  }

  public close(): void {
    // Nothing to close.
  }
}

export const demoEventSourceFactory = (): EventSource => new DemoEventSource() as unknown as EventSource;
