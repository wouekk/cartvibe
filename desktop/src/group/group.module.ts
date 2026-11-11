import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";

import { CheckboxModule } from "src/checkbox/checkbox.module";

import { SelectModule } from "src/select/select.module";
import { SharedUiModule } from "src/shared-ui/shared-ui.module";
import { TableModule } from "src/table/table.module";
import { UserAutocompleteModule } from "src/user-autocomplete/user-autocomplete.module";
import { AutocompleteModule } from "../autocomplete/autocomplete.module";
import { ButtonModule } from "../button";

import { InputModule } from "../input";
import { GroupDetailsComponent } from "./group-details/group-details.component";
import { GroupFormComponent } from "./group-form/group-form.component";
import { GroupMemberFormComponent } from "./group-member-form/group-member-form.component";
import { GroupReceiptSettingsComponent } from "./group-receipt-settings/group-receipt-settings.component";
import { GroupRoutingModule } from "./group-routing.module";
import { GroupTableEditButtonPipe } from "./group-table/group-table-edit-button.pipe";
import { GroupTableComponent } from "./group-table/group-table.component";
import { GroupTabsComponent } from "./group-tabs/group-tabs.component";
import { ReceiptProductBackfillComponent } from "../standalone/components/receipt-product-backfill/receipt-product-backfill.component";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmDropdownMenuImports } from "@spartan-ng/helm/dropdown-menu";
import { AppIconComponent } from "../shared-ui/icon/icon.component";
import { GroupLookPickerComponent } from "./group-look-picker/group-look-picker.component";
import { AvatarModule } from "../avatar";
import { RowActionsComponent } from "../shared-ui/row-actions/row-actions.component";

@NgModule({
    imports: [
    ButtonModule,
    ReceiptProductBackfillComponent,
    CheckboxModule,
    CommonModule,
    GroupRoutingModule,
    InputModule,
    ReactiveFormsModule,
    SelectModule,
    SharedUiModule,
    TableModule,
    UserAutocompleteModule,
    AutocompleteModule,
    HlmButton,
    ...HlmDropdownMenuImports,
    AppIconComponent,
    GroupLookPickerComponent,
    AvatarModule,
    RowActionsComponent,
    GroupTableComponent,
    GroupFormComponent,
    GroupMemberFormComponent,
    GroupTabsComponent,
    GroupDetailsComponent,
    GroupTableEditButtonPipe,
    GroupReceiptSettingsComponent,
],
    exports: [GroupTableComponent],
})
export class GroupsModule {}
