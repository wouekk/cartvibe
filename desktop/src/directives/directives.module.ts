import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { FeatureDirective } from "./feature.directive";
import { HasAppPermissionDirective } from "./has-app-permission.directive";
import { HasGroupPermissionDirective } from "./has-group-permission.directive";

@NgModule({
  declarations: [
    FeatureDirective,
    HasAppPermissionDirective,
    HasGroupPermissionDirective,
  ],
  exports: [
    FeatureDirective,
    HasAppPermissionDirective,
    HasGroupPermissionDirective,
  ],
  imports: [CommonModule],
})
export class DirectivesModule {}
