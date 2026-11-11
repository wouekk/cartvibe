import { Directive, Input, TemplateRef, ViewContainerRef, inject } from "@angular/core";
import { FeatureConfigStore } from "../store/feature-config.store";

/**
 * Add the template content to the DOM unless the condition is true.
 */
@Directive({ selector: '[appFeature]' })
export class FeatureDirective {
  private readonly featureConfigStore = inject(FeatureConfigStore);

  private hasView = false;

  constructor(
    private templateRef: TemplateRef<any>,
    private viewContainer: ViewContainerRef
  ) {}

  @Input() set appFeature(feature: string) {
    const hasFeature = this.featureConfigStore.hasFeature(feature);

    if (hasFeature) {
      this.viewContainer.createEmbeddedView(this.templateRef);
      this.hasView = true;
    } else if (!hasFeature) {
      this.viewContainer.clear();
      this.hasView = false;
    }
  }
}
