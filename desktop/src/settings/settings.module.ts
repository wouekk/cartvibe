import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";
import { AppIconComponent } from "../shared-ui/icon/icon.component";

import { HlmButton } from "@spartan-ng/helm/button";
import { HlmTooltipImports } from "@spartan-ng/helm/tooltip";
import { ColorSwatchesComponent } from "../shared-ui/color-swatches/color-swatches.component";

import { SelectModule } from "src/select/select.module";
import { SharedUiModule } from "src/shared-ui/shared-ui.module";
import { TableModule } from "src/table/table.module";
import { UserAutocompleteModule } from "src/user-autocomplete/user-autocomplete.module";
import { AutocompleteModule } from "../autocomplete/autocomplete.module";
import { CheckboxModule } from "../checkbox/checkbox.module";

import { InputModule } from "../input";
import { DeleteAccountDialogComponent } from "./delete-account-dialog/delete-account-dialog.component";
import { SettingsRoutingModule } from "./settings-routing.module";
import { SettingsComponent } from "./settings/settings.component";
import { UserPreferencesComponent } from "./user-preferences/user-preferences.component";
import { UserProfileComponent } from "./user-profile/user-profile.component";
import { AvatarPhotoComponent } from "./avatar-photo/avatar-photo.component";

@NgModule({
    imports: [
    AutocompleteModule,
    CheckboxModule,
    ColorSwatchesComponent,
    CommonModule,
    InputModule,
    HlmButton,
    AppIconComponent,
    ...HlmTooltipImports,
    ReactiveFormsModule,
    SelectModule,
    SettingsRoutingModule,
    SharedUiModule,
    TableModule,
    UserAutocompleteModule,
    AvatarPhotoComponent,
    DeleteAccountDialogComponent,
    SettingsComponent,
    UserProfileComponent,
    UserPreferencesComponent,
],
})
export class SettingsModule {}
