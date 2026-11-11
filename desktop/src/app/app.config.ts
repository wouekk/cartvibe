import { ApplicationConfig, isDevMode, provideAppInitializer, provideZonelessChangeDetection, inject } from "@angular/core";
import { provideServiceWorker } from "@angular/service-worker";
import { provideHttpClient, withInterceptors, withXhr } from "@angular/common/http";
import { importProvidersFrom } from "@angular/core";
import { provideNgxMask } from "ngx-mask";
import { withNgxsReduxDevtoolsPlugin } from "@ngxs/devtools-plugin";
import { withNgxsStoragePlugin } from "@ngxs/storage-plugin";
import { provideStore } from "@ngxs/store";
import { AppInitService, initAppData } from "src/services";
import { AppUpdateService } from "../services/app-update.service";
import { QueuedScanService } from "../services/queued-scan.service";
import { ShoppingListSyncService } from "../services/shopping-list-sync.service";
import { httpInterceptor } from "../interceptors/http-interceptor";
import { rateLimitRetryInterceptor } from "../interceptors/rate-limit-retry.interceptor";
import { serviceWorkerBypassInterceptor } from "../interceptors/service-worker-bypass.interceptor";
import { HlmTooltipImports } from "@spartan-ng/helm/tooltip";
import { NgxMaskDirective, NgxMaskPipe } from "ngx-mask";
import { AppRoutingModule } from "./app-routing.module";
import { LayoutModule } from "../layout/layout.module";
import { ApiModule, Configuration } from "../open-api";
import { PipesModule } from "../pipes";
import { ngxsStates, ngxsStorageKeys } from "../store/ngxs-states";
import { LanguageSyncService, TranslationLoader } from "../i18n";
import { OnboardingService } from "../onboarding/onboarding.service";
import { DEMO_MODE, demoInterceptors, demoProviders } from "../demo/demo-runtime";
import { environment } from "src/environments/environment";

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    // The retry sits inside httpInterceptor, so a toast is shown only for a request that was still refused after it.
    provideHttpClient(withXhr(), withInterceptors([serviceWorkerBypassInterceptor, httpInterceptor, rateLimitRetryInterceptor, ...demoInterceptors])),
    provideNgxMask(),
    // App shell only (ngsw-config.json): API, SSE and OAuth calls always go to the network. Off in development.
    provideServiceWorker("ngsw-worker.js", {
      enabled: !isDevMode() && !DEMO_MODE,
      registrationStrategy: "registerWhenStable:30000",
    }),
    provideAppInitializer(() => {
      inject(AppUpdateService);
      // Created at start, not with the lists page: changes made without a connection on an earlier visit are sent
      // (and queued receipt photos uploaded) wherever the app opens.
      inject(ShoppingListSyncService);
      inject(QueuedScanService);
    }),
    provideAppInitializer(() => {
      const initializerFn = (initAppData)(inject(AppInitService));
      return initializerFn();
    }),
    // Languages are runtime JSON. Load the list and the signed-in account's cached language before the first render, so
    // the page does not flash in English. It never rejects: a failed load leaves the interface in English.
    provideAppInitializer(async () => {
      inject(LanguageSyncService);
      // Greets a new account once (language, theme, household currency) after its preferences load.
      inject(OnboardingService);
      await inject(TranslationLoader).initialize();
    }),
    provideStore(
      ngxsStates,
      {
        developmentMode: !environment.isProd,
        // Selectors are built without `new Function`, which the CSP (no 'unsafe-eval') would block.
        compatibility: { strictContentSecurityPolicy: true },
      },
      withNgxsStoragePlugin({ keys: ngxsStorageKeys }),
      withNgxsReduxDevtoolsPlugin({ disabled: environment.isProd }),
    ),
    importProvidersFrom(
      ApiModule.forRoot(() => new Configuration({ basePath: undefined })),
      AppRoutingModule,
      LayoutModule,
      ...HlmTooltipImports,
      NgxMaskDirective,
      NgxMaskPipe,
      PipesModule,
    ),
    // Empty in the real app. The `demo` build swaps in an in-memory backend (src/demo, desktop/docs/demo.md).
    ...demoProviders,
  ],
};
