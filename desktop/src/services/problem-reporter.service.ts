import { HttpContext } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { take } from "rxjs";
import { QUIET_ERRORS } from "../interceptors/http-interceptor";
import { ClientReportService } from "../open-api";

/** Where reports wait until the server takes them. */
export const PROBLEM_REPORTS_KEY = "cartvibe.problemReports";

/** How many waiting reports are kept; the oldest go first. */
const MAX_WAITING = 10;

/** A report that has waited longer than this is dropped: it would explain nothing any more. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface WaitingReport {
  kind: string;
  detail: string;
  at: number;
}

/**
 * Tells the server's log what went wrong in the browser, where the server could not have seen it: a phone that
 * closed the page while its camera was open, a file left out of a scan. Without it such a failure leaves no trace
 * anywhere, and "it did not work" has nothing to start from.
 *
 * A report never gets in the way: it is sent quietly, it never throws, and one that cannot be sent (no connection,
 * signed out) waits in the browser, the last ten of them, and goes out with the next report or the next start.
 */
@Injectable({ providedIn: "root" })
export class ProblemReporter {
  private readonly clientReportService = inject(ClientReportService);

  private sending = false;

  /** `kind` is lower-case words joined by hyphens ("quick-scan-file-left-out"); `detail` is one line. */
  public report(kind: string, detail: string): void {
    const waiting = this.read();
    waiting.push({ kind, detail, at: Date.now() });
    this.write(waiting.slice(-MAX_WAITING));
    this.flush();
  }

  /** Sends what is waiting, oldest first; stops at the first one the server does not take. */
  public flush(): void {
    if (this.sending) {
      return;
    }
    const next = this.read()[0];
    if (!next) {
      return;
    }

    this.sending = true;
    const late = Date.now() - next.at > 60_000 ? ` [happened ${new Date(next.at).toISOString()}]` : "";
    this.clientReportService
      .sendClientReport({ kind: next.kind, detail: next.detail + late }, "body", false, {
        context: new HttpContext().set(QUIET_ERRORS, true),
      })
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.sending = false;
          this.write(this.read().filter((report) => report.at !== next.at || report.kind !== next.kind));
          this.flush();
        },
        // No connection, or not signed in: it waits for the next report or the next start.
        error: () => {
          this.sending = false;
        },
      });
  }

  private read(): WaitingReport[] {
    try {
      const stored = JSON.parse(localStorage.getItem(PROBLEM_REPORTS_KEY) ?? "[]");
      if (!Array.isArray(stored)) {
        return [];
      }
      return stored.filter(
        (report): report is WaitingReport =>
          typeof report?.kind === "string" &&
          typeof report?.detail === "string" &&
          typeof report?.at === "number" &&
          Date.now() - report.at < MAX_AGE_MS
      );
    } catch {
      return [];
    }
  }

  private write(waiting: WaitingReport[]): void {
    try {
      if (waiting.length === 0) {
        localStorage.removeItem(PROBLEM_REPORTS_KEY);
      } else {
        localStorage.setItem(PROBLEM_REPORTS_KEY, JSON.stringify(waiting));
      }
    } catch {
      // A browser that keeps nothing: the report was sent once, which is all that can be done.
    }
  }
}
