import { computed, Directive, effect, inject, input, TemplateRef, ViewContainerRef } from "@angular/core";
import { hasAll } from "../utils/permission.utils";
import { AuthStore } from "../store/auth.store";

/**
 * Structural directive that renders its template only while the current user
 * holds the given app-scoped permission.
 *
 * Signal/effect-driven so it re-renders when the permission list arrives after
 * first paint (e.g. AppData lands post-login) — unlike a one-shot
 * `selectSnapshot` in an input setter, which never updates.
 */
@Directive({ selector: "[hasAppPermission]", })
export class HasAppPermissionDirective {
  private readonly authStore = inject(AuthStore);

  private readonly templateRef = inject(TemplateRef<unknown>);
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly appPermissions = this.authStore.appPermissions;

  public readonly permission = input.required<string>({ alias: "hasAppPermission" });

  private readonly granted = computed(() =>
    hasAll(this.appPermissions(), this.permission())
  );

  constructor() {
    effect(() => {
      this.viewContainer.clear();
      if (this.granted()) {
        this.viewContainer.createEmbeddedView(this.templateRef);
      }
    });
  }
}
