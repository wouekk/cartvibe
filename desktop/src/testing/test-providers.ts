import { CurrencyPipe } from "@angular/common";
import { provideRouter } from "@angular/router";
import { provideNgxMask } from "ngx-mask";
import { StateStorage } from "../store/state-storage";
import { NoStateStorage } from "./no-state-storage";

/**
 * What every spec gets, because the app provides it at its root (`app.config.ts`) and a standalone component brings
 * its real children with it: an `app-input` needs the mask's configuration, a link needs the router, and the money
 * pipe needs Angular's CurrencyPipe. A spec that provides its own `Router` or `ActivatedRoute` still wins.
 * The stores keep nothing between tests (`NoStateStorage`).
 * Loaded by the test target (`providersFile` in `angular.json`).
 */
export default [provideNgxMask(), provideRouter([]), CurrencyPipe, { provide: StateStorage, useClass: NoStateStorage }];
