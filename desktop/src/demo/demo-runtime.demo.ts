import { HttpBackend, HttpInterceptorFn } from "@angular/common/http";
import { EnvironmentProviders, Provider, inject, provideAppInitializer } from "@angular/core";
import { AppInitService } from "../services/app-init.service";
import { ShoppingListStreamService } from "../services/shopping-list-stream.service";
import { DemoAppInitService } from "./demo-app-init.service";
import { demoEventSourceFactory } from "./demo-event-source";
import { DemoHttpBackend } from "./demo-http-backend";
import { demoInterceptor } from "./demo-interceptor";
import { installDemoStorage } from "./demo-storage";

export { DemoBannerComponent } from "./demo-banner.component";
export { DemoFooterComponent } from "./demo-footer.component";

/** The demo side of the seam (see `demo-runtime.ts`). */
export const DEMO_MODE = true;

// Before anything reads the store: from here on the app's storage keys carry the demo prefix.
installDemoStorage();

export const demoInterceptors: HttpInterceptorFn[] = [demoInterceptor];

export const demoProviders: (Provider | EnvironmentProviders)[] = [
  DemoHttpBackend,
  { provide: HttpBackend, useExisting: DemoHttpBackend },
  { provide: AppInitService, useExisting: DemoAppInitService },
  provideAppInitializer(() => {
    inject(ShoppingListStreamService).setEventSourceFactory(demoEventSourceFactory);
  }),
];
