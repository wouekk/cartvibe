import { NgModule } from "@angular/core";
import { RouterModule, Routes } from "@angular/router";
import { FormMode } from "src/enums/form-mode.enum";
import { appPermissionGuard } from "src/guards/app-permission.guard";
import { settingsLandingGuard } from "src/guards/settings-landing.guard";
import { FormConfig } from "src/interfaces";
import { Permission } from "../open-api";
import { SettingsComponent } from "./settings/settings.component";
import { UserPreferencesComponent } from "./user-preferences/user-preferences.component";
import { UserProfileComponent } from "./user-profile/user-profile.component";
import { marker } from "../i18n/marker";

const routes: Routes = [
  {
    path: "",
    canActivate: [settingsLandingGuard],
    children: [],
    pathMatch: "full",
  },
  {
    path: "",
    component: SettingsComponent,
    children: [
      {
        path: "user-profile/view",
        component: UserProfileComponent,
        canActivate: [appPermissionGuard],
        data: {
          formConfig: {
            mode: FormMode.view,
            headerText: marker("View User Profile"),
          } as FormConfig,
          appPermissions: [Permission.AppAccountRead],
        },
      },
      {
        path: "user-profile/edit",
        component: UserProfileComponent,
        canActivate: [appPermissionGuard],
        data: {
          formConfig: {
            mode: FormMode.edit,
            headerText: marker("Edit User Profile"),
          } as FormConfig,
          appPermissions: [Permission.AppAccountUpdate],
        },
      },
      {
        path: "user-preferences/view",
        component: UserPreferencesComponent,
        canActivate: [appPermissionGuard],
        data: {
          formConfig: {
            mode: FormMode.view,
            headerText: marker("View User Preferences"),
          } as FormConfig,
          appPermissions: [Permission.AppUserPreferencesRead],
        },
      },
      {
        path: "user-preferences/edit",
        component: UserPreferencesComponent,
        canActivate: [appPermissionGuard],
        data: {
          formConfig: {
            mode: FormMode.edit,
            headerText: marker("Edit User Preferences"),
          } as FormConfig,
          appPermissions: [Permission.AppUserPreferencesUpdate],
        },
      },
      // Theme moved to its own page in the sidebar's Settings section; old links still land there.
      {
        path: "theme",
        redirectTo: "/theme",
      },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SettingsRoutingModule {}
