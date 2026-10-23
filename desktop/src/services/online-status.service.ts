import { Injectable, signal } from "@angular/core";

/**
 * Whether the browser believes it has a network connection. It can be wrong in the "online but no signal" direction, so
 * it only drives a quiet notice; a request that fails is still reported by the code that made it.
 */
@Injectable({ providedIn: "root" })
export class OnlineStatusService {
  public readonly online = signal(typeof navigator === "undefined" ? true : navigator.onLine);

  public constructor() {
    window.addEventListener("online", () => this.online.set(true));
    window.addEventListener("offline", () => this.online.set(false));
  }
}
