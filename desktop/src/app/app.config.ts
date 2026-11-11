import { ApplicationConfig, isDevMode, provideAppInitializer, provideZonelessChangeDetection, inject } from "@angular/core";
import { CurrencyPipe } from "@angular/common";
import { provideServiceWorker } from "@angular/service-worker";
import { provideHttpClient, withInterceptors, withXhr } from "@angular/common/http";
import { importProvidersFrom } from "@angular/core";
import { provideNgxMask } from "ngx-mask";
import { AppInitService, initAppData } from "src/services";
import { AppUpdateService } from "../services/app-update.service";
import { QueuedScanService } from "../services/queued-scan.service";
import { ShoppingListSyncService } from "../services/shopping-list-sync.service";
import { httpInterceptor } from "../interceptors/http-interceptor";
import { rateLimitRetryInterceptor } from "../interceptors/rate-limit-retry.interceptor";
import { serviceWorkerBypassInterceptor } from "../interceptors/service-worker-bypass.interceptor";
import { HlmTooltipImports } from "@spartan-ng/helm/tooltip";
import { AppRoutingModule } from "./app-routing.module";
import { LayoutModule } from "../layout/layout.module";
import { ApiModule, Configuration } from "../open-api";
import { LanguageSyncService, TranslationLoader } from "../i18n";
import { OnboardingService } from "../onboarding/onboarding.service";
import { DEMO_MODE, demoInterceptors, demoProviders } from "../demo/demo-runtime";

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    // The retry sits inside httpInterceptor, so a toast is shown only for a request that was still refused after it.
    provideHttpClient(withXhr(), withInterceptors([serviceWorkerBypassInterceptor, httpInterceptor, rateLimitRetryInterceptor, ...demoInterceptors])),
    provideNgxMask(),
    // The money pipe (customCurrency) is built on Angular's CurrencyPipe and asks the injector for it. The shared
    // module used to provide it to every page; components are standalone now, so it is provided here once.
    CurrencyPipe,
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
    // The router and the API client come from their modules. Nothing reports their absence at build time: without
    // this block the app starts and shows an empty page (the demo's Playwright suite is what notices).
    importProvidersFrom(
      ApiModule.forRoot(() => new Configuration({ basePath: undefined })),
      AppRoutingModule,
      LayoutModule,
      ...HlmTooltipImports,
    ),
    // Empty in the real app. The `demo` build swaps in an in-memory backend (src/demo, desktop/docs/demo.md).
    ...demoProviders,
  ],
};
