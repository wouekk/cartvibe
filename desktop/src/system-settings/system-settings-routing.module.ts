import { NgModule } from "@angular/core";
import { RouterModule, Routes } from "@angular/router";
import { FormMode } from "../enums/form-mode.enum";
import { appPermissionGuard } from "../guards/app-permission.guard";
import { systemSettingsLandingGuard } from "../guards/system-settings-landing.guard";
import { FormConfig } from "../interfaces";
import { Permission } from "../open-api";
import { allReceiptProcessingSettingsResolver } from "./resolvers/receipt-processing-settings.resolver";
import { systemSettingsResolver } from "./resolvers/system-settings.resolver";
import { LogsPageComponent } from "./logs/logs-page.component";
import { SystemSettingsFormComponent } from "./system-settings-form/system-settings-form.component";
import { SystemSettingsComponent } from "./system-settings/system-settings.component";

const routes: Routes = [
  {
    path: "",
    canActivate: [systemSettingsLandingGuard],
    children: [],
    pathMatch: "full",
  },
  {
    path: "",
    component: SystemSettingsComponent,
    children: [
      // The four settings tabs are the one form showing its own cards (route data `section`). Each carries
      // every resolver its cards need, because the tables embedded in a tab read the route's data: system
      // emails want allGroups, system tasks want prompts and the processing settings.
      ...(["general", "security", "tasks"] as const).map((section) => ({
        path: section,
        component: SystemSettingsFormComponent,
        canActivate: [appPermissionGuard],
        data: {
          section,
          formConfig: {
            mode: FormMode.edit,
          } as FormConfig,
          appPermissions: [Permission.AppSystemSettingsRead],
        },
        resolve: {
          allReceiptProcessingSettings: allReceiptProcessingSettingsResolver,
          systemSettings: systemSettingsResolver,
        },
      })),
      // The old tab addresses keep working for bookmarks and links.
      { path: "settings/view", redirectTo: "general", pathMatch: "full" },
      { path: "settings/edit", redirectTo: "general", pathMatch: "full" },
      { path: "integrations", redirectTo: "general", pathMatch: "full" },
      { path: "system-tasks", redirectTo: "tasks", pathMatch: "full" },
      {
        path: "logs",
        component: LogsPageComponent,
        canActivate: [appPermissionGuard],
        data: {
          appPermissions: [Permission.AppSystemSettingsRead],
        },
      },
    ]
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SystemSettingsRoutingModule {
}
