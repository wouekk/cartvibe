const INITIAL_RETRY_DELAY_MS = 2000;
const MAX_RETRY_DELAY_MS = 30000;

/**
 * Whether a failed request is worth another try. No connection (status 0), a restarting or overloaded server (5xx,
 * 429) and a timeout are; anything else is the server's answer to the request itself, and trying again would get the
 * same one.
 */
export function isWorthRetrying(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status !== "number" || status === 0 || status === 408 || status === 429 || status >= 500;
}

/**
 * Runs work that needs the server until it is done: once when asked (`kick`), again when the browser reports a
 * connection or the tab becomes visible, and otherwise on a timer that backs off from 2 to 30 seconds. One run at a
 * time; a `kick` during a run starts another one right after it, so nothing queued meanwhile is left behind.
 *
 * `work` resolves true when nothing is left to do and false when the server could not be reached.
 */
export class RetryWhenReachable {
  /** The attempt under way, so a caller that asks meanwhile can wait for it (and for the one that follows it). */
  private current?: Promise<void>;

  private kickedWhileRunning = false;

  private timer?: ReturnType<typeof setTimeout>;

  private delayMs = INITIAL_RETRY_DELAY_MS;

  private readonly wake = () => {
    if (this.document.visibilityState === "visible") {
      this.kick();
    }
  };

  constructor(
    private readonly document: Document,
    private readonly work: () => Promise<boolean>
  ) {
    this.document.defaultView?.addEventListener("online", this.wake);
    this.document.addEventListener("visibilitychange", this.wake);
  }

  public kick(): void {
    void this.run();
  }

  /**
   * Resolves when the work has been tried with everything asked for so far: done, or put off until later. Asked
   * during an attempt, it resolves when that attempt and the one it triggers have ended.
   */
  public run(): Promise<void> {
    if (this.current) {
      this.kickedWhileRunning = true;
      return this.current;
    }

    this.current = this.attempt();
    return this.current;
  }

  private async attempt(): Promise<void> {
    this.clearTimer();
    let done = false;
    do {
      this.kickedWhileRunning = false;
      try {
        done = await this.work();
      } catch {
        done = false;
      }
    } while (this.kickedWhileRunning);

    // Nothing below waits, so a `run()` that arrives from here on starts a fresh attempt.
    this.current = undefined;
    if (done) {
      this.delayMs = INITIAL_RETRY_DELAY_MS;
      return;
    }

    const delay = this.delayMs;
    this.delayMs = Math.min(this.delayMs * 2, MAX_RETRY_DELAY_MS);
    this.timer = setTimeout(() => this.kick(), delay);
  }

  /** Stops waiting: nothing is left to send (the account signed out). */
  public cancel(): void {
    this.clearTimer();
    this.delayMs = INITIAL_RETRY_DELAY_MS;
  }

  public dispose(): void {
    this.cancel();
    this.document.defaultView?.removeEventListener("online", this.wake);
    this.document.removeEventListener("visibilitychange", this.wake);
  }

  private clearTimer(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}
