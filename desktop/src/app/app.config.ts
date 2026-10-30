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
import { httpInterceptor } from "../interceptors/http-interceptor";
import { serviceWorkerBypassInterceptor } from "../interceptors/service-worker-bypass.interceptor";
import { HlmTooltipImports } from "@spartan-ng/helm/tooltip";
import { NgxMaskDirective, NgxMaskPipe } from "ngx-mask";
import { AppRoutingModule } from "./app-routing.module";
import { LayoutModule } from "../layout/layout.module";
import { ApiModule, Configuration } from "../open-api";
import { PipesModule } from "../pipes";
import { AboutState } from "../store/about.state";
import { AuthState } from "../store/auth.state";
import { CategoryTableState } from "../store/category-table.state";
import { FeatureConfigState } from "../store/feature-config.state";
import { GroupTableState } from "../store/group-table.state";
import { GroupState } from "../store/group.state";
import { LayoutState } from "../store/layout.state";
import { ReceiptProcessingSettingsTaskTableState } from "../store/receipt-processing-settings-task-table.state";
import { ReceiptTableState } from "../store/receipt-table.state";
import { ReportTemplateTableState } from "../store/report-template-table.state";
import { ShoppingListState } from "../store/shopping-list.state";
import { SystemSettingsState } from "../store/system-settings.state";
import { SystemTaskTableState } from "../store/system-task-table.state";
import { TagTableState } from "../store/tag-table.state";
import { UserTableState } from "../store/user-table.state";
import { UserState } from "../store/user.state";
import { LanguageSyncService, TranslationLoader } from "../i18n";
import { OnboardingService } from "../onboarding/onboarding.service";
import { environment } from "src/environments/environment.development";

const ngxsStates = [
  AboutState,
  AuthState,
  CategoryTableState,
  FeatureConfigState,
  GroupState,
  GroupTableState,
  LayoutState,
  ReceiptProcessingSettingsTaskTableState,
  ReceiptTableState,
  ReportTemplateTableState,
  // Not in ngxsStorageKeys: the server is the source of truth.
  ShoppingListState,
  SystemSettingsState,
  SystemTaskTableState,
  TagTableState,
  UserTableState,
  UserState,
];

const ngxsStorageKeys = [
  "about",
  "auth",
  "categoryTable",
  "groupTable",
  "groups",
  "layout",
  "receiptProcessingSettingsTaskTable",
  "receiptTable",
  "reportTemplateTable",
  "systemSettings",
  "systemTaskTable",
  "tagTable",
  "userTable",
  "users",
];

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideHttpClient(withXhr(), withInterceptors([serviceWorkerBypassInterceptor, httpInterceptor])),
    provideNgxMask(),
    // App shell only (ngsw-config.json): API, SSE and OAuth calls always go to the network. Off in development.
    provideServiceWorker("ngsw-worker.js", {
      enabled: !isDevMode(),
      registrationStrategy: "registerWhenStable:30000",
    }),
    provideAppInitializer(() => {
      inject(AppUpdateService);
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
  ],
};
