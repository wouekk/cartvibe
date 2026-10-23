import { DestroyRef, Injectable, inject } from "@angular/core";
import { SwUpdate, VersionReadyEvent } from "@angular/service-worker";
import { NavigationStart, Router } from "@angular/router";
import { filter } from "rxjs";

/**
 * Keeps an installed or cached CartVibe current. The service worker downloads a new version in the background; this
 * service waits until the person moves to another page (so nothing typed is lost), then loads that page fresh from the
 * new version. It also looks for an update whenever the tab comes back into view, because a phone app can stay open
 * for days. Without a service worker (development, unsupported browsers) it does nothing.
 */
@Injectable({ providedIn: "root" })
export class AppUpdateService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private updateReady = false;

  public constructor() {
    if (!this.swUpdate.isEnabled) {
      return;
    }

    const ready = this.swUpdate.versionUpdates
      .pipe(filter((event): event is VersionReadyEvent => event.type === "VERSION_READY"))
      .subscribe(() => (this.updateReady = true));

    const navigations = this.router.events
      .pipe(filter((event): event is NavigationStart => event instanceof NavigationStart))
      .subscribe((event) => this.onNavigationStart(event.url));

    document.addEventListener("visibilitychange", this.checkWhenVisible);

    this.destroyRef.onDestroy(() => {
      ready.unsubscribe();
      navigations.unsubscribe();
      document.removeEventListener("visibilitychange", this.checkWhenVisible);
    });
  }

  /** The browser's full page load; a seam so a spec can see where it goes (jsdom cannot replace window.location). */
  public navigateToUrl(url: string): void {
    window.location.assign(url);
  }

  private onNavigationStart(url: string): void {
    if (!this.updateReady) {
      return;
    }

    this.updateReady = false;
    this.swUpdate
      .activateUpdate()
      .catch(() => undefined)
      .then(() => this.navigateToUrl(url));
  }

  private checkWhenVisible = (): void => {
    if (document.visibilityState === "visible") {
      this.swUpdate.checkForUpdate().catch(() => undefined);
    }
  };
}
