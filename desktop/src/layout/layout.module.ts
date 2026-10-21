import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";
import { HlmButton } from "@spartan-ng/helm/button";

import { AppIconComponent } from "../shared-ui/icon/icon.component";
import { HlmTooltipImports } from "@spartan-ng/helm/tooltip";
import { RouterModule } from "@angular/router";
import { OverlayModule } from "@angular/cdk/overlay";
import { AutocompleteModule } from "src/autocomplete/autocomplete.module";
import { NotificationsModule } from "src/notifications/notifications.module";
import { PipesModule } from "src/pipes/pipes.module";
import { ProductCheckInputComponent } from "src/product-check/product-check-input.component";
import { SharedUiModule } from "src/shared-ui/shared-ui.module";
import { AvatarModule } from "../avatar";
import { NgIcon } from "@ng-icons/core";
import { HlmCollapsibleImports } from "@spartan-ng/helm/collapsible";
import { HlmDropdownMenuImports } from "@spartan-ng/helm/dropdown-menu";
import { HlmSidebarImports } from "@spartan-ng/helm/sidebar";
import { ButtonModule } from "../button";
import { DirectivesModule } from "../directives/directives.module";
import { AddReceiptIconComponent } from "./add-receipt-icon/add-receipt-icon.component";
import { DashboardIconComponent } from "./dashboard-icon/dashboard-icon.component";
import { HeaderComponent } from "./header/header.component";
import { ReceiptListIconComponent } from "./receipt-list-icon/receipt-list-icon.component";
import { SidebarComponent } from "./sidebar/sidebar.component";

@NgModule({
  declarations: [
    AddReceiptIconComponent,
    DashboardIconComponent,
    HeaderComponent,
    ReceiptListIconComponent,
    SidebarComponent,
  ],
  imports: [
    AutocompleteModule,
    AvatarModule,
    ButtonModule,
    CommonModule,
    DirectivesModule,
    DirectivesModule,
    HlmButton,
    AppIconComponent,
    NgIcon,
    ...HlmCollapsibleImports,
    ...HlmDropdownMenuImports,
    ...HlmSidebarImports,
    ...HlmTooltipImports,
    OverlayModule,
    NotificationsModule,
    PipesModule,
    PipesModule,
    ReactiveFormsModule,
    RouterModule,
    ProductCheckInputComponent,
    SharedUiModule,
  ],
  exports: [HeaderComponent, AddReceiptIconComponent],
})
export class LayoutModule {}
