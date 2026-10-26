import { Injectable, signal } from "@angular/core";

/**
 * The full-screen splash between pressing Login and seeing the first page. It lives in the app root, above the
 * sidebar and header, because those appear the moment the session is stored, while the router is still loading the
 * Dashboard: drawn inside the login page, the splash sat in the middle of an app already on screen. The root fades it
 * out once the first page is in place, so the two screens hand over in one fade.
 */
@Injectable({ providedIn: "root" })
export class SignInTransitionService {
  private readonly signingIn = signal(false);

  public readonly active = this.signingIn.asReadonly();

  public start(): void {
    this.signingIn.set(true);
  }

  public finish(): void {
    this.signingIn.set(false);
  }
}
