import { HttpInterceptorFn } from "@angular/common/http";
import { ChangeDetectionStrategy, Component, EnvironmentProviders, Provider } from "@angular/core";

/**
 * The production side of the demo seam. `angular.json` swaps this file for `demo-runtime.demo.ts` in the `demo` build;
 * here every piece is empty, so nothing of the demo (backend, sample data, banner) is compiled into the real app.
 * `tools/check-demo-bundle.cjs` fails CI if a trace of it shows up in the production bundle.
 */
export const DEMO_MODE = false;

export const demoInterceptors: HttpInterceptorFn[] = [];

export const demoProviders: (Provider | EnvironmentProviders)[] = [];

@Component({ selector: "app-demo-banner", template: "", changeDetection: ChangeDetectionStrategy.OnPush })
export class DemoBannerComponent {}

@Component({ selector: "app-demo-footer", template: "", changeDetection: ChangeDetectionStrategy.OnPush })
export class DemoFooterComponent {}
