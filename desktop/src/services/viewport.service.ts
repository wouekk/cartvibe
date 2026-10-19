import { BreakpointObserver } from "@angular/cdk/layout";
import { Injectable } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { map } from "rxjs";

/** Matches Bootstrap's `md` breakpoint, which the rest of the layout's SCSS uses. */
export const HANDSET_MEDIA_QUERY = "(max-width: 767.98px)";

/**
 * Whether the app is on a phone-sized screen. The shell switches between a sidebar that slides in
 * over the page (phone) and one that is always shown (desktop) on this, so the header button and
 * the sidebar must agree on it — hence one place.
 */
@Injectable({
  providedIn: "root",
})
export class ViewportService {
  public readonly isHandset = toSignal(
    this.breakpointObserver.observe(HANDSET_MEDIA_QUERY).pipe(map((state) => state.matches)),
    { initialValue: this.breakpointObserver.isMatched(HANDSET_MEDIA_QUERY) }
  );

  constructor(private breakpointObserver: BreakpointObserver) {}
}
