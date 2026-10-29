import { NgModule } from "@angular/core";
import { RouterModule, Routes } from "@angular/router";
import { appPermissionGuard } from "src/guards/app-permission.guard";
import { AuthGuard } from "src/guards/auth.guard";
import { SidebarComponent } from "src/layout/sidebar/sidebar.component";
import { Permission } from "../open-api";

const routes: Routes = [
  {
    path: "",
    component: SidebarComponent,
    children: [
      {
        path: "auth",
        loadChildren: () =>
          import("../auth").then(
            (m) => m.AuthModule
          ),
        canActivate: [AuthGuard],
      },
      {
        path: "categories",
        loadChildren: () =>
          import("../categories/categories.module").then(
            (m) => m.CategoriesModule
          ),
        canActivate: [AuthGuard, appPermissionGuard],
        data: {
          appPermissions: [Permission.AppCategoriesRead],
        },
      },
      {
        path: "tags",
        loadChildren: () =>
          import("../tags/tags.module").then((m) => m.TagsModule),
        canActivate: [AuthGuard, appPermissionGuard],
        data: {
          appPermissions: [Permission.AppTagsRead],
        },
      },
      {
        path: "groups",
        loadChildren: () =>
          import("../group/group.module").then((m) => m.GroupsModule),
        canActivate: [AuthGuard],
      },
      {
        path: "receipts",
        loadChildren: () =>
          import("../receipts/receipts.module").then((m) => m.ReceiptsModule),
        canActivate: [AuthGuard],
      },
      {
        // The landing page; access is decided per group by overviewReadGuard inside the module.
        path: "overview",
        loadChildren: () => import("../overview/overview.module").then((m) => m.OverviewModule),
        canActivate: [AuthGuard],
      },
      {
        // Group-scoped; access is decided per group by shoppingListGroupGuard inside the module.
        path: "shopping-lists",
        loadChildren: () =>
          import("../shopping-lists/shopping-lists.module").then((m) => m.ShoppingListsModule),
        canActivate: [AuthGuard],
      },
      {
        // Group-scoped like the receipts list; the API applies the receipt read rules to what it lists.
        path: "warranties/group/:groupId",
        loadComponent: () => import("../warranties/warranties-page.component").then((m) => m.WarrantiesPageComponent),
        canActivate: [AuthGuard],
      },
      {
        path: "settings",
        loadChildren: () =>
          import("../settings/settings.module").then((m) => m.SettingsModule),
        canActivate: [AuthGuard, appPermissionGuard],
        data: {
          appPermissions: [
            Permission.AppAccountRead,
            Permission.AppUserPreferencesRead,
          ],
        },
      },
      {
        // The admin's AI page (Phase 3 A1): provider, model, key, test connection.
        path: "ai",
        loadComponent: () =>
          import("../ai-settings/ai-settings-page/ai-settings-page.component").then((m) => m.AiSettingsPageComponent),
        canActivate: [AuthGuard, appPermissionGuard],
        data: {
          appPermissions: [Permission.AppReceiptProcessingSettingsUpdate],
        },
      },
      // Per browser (theme) or per account (language), so any signed-in user may open them.
      {
        path: "theme",
        loadComponent: () => import("../settings/theme/theme-page.component").then((m) => m.ThemePageComponent),
        canActivate: [AuthGuard],
      },
      {
        path: "language",
        loadComponent: () => import("../settings/theme/language-page.component").then((m) => m.LanguagePageComponent),
        canActivate: [AuthGuard],
      },
      {
        path: "system-settings",
        loadChildren: () =>
          import("../system-settings/system-settings.module").then((m) => m.SystemSettingsModule),
        canActivate: [AuthGuard, appPermissionGuard],
        data: {
          appPermissions: [
            Permission.AppSystemSettingsRead,
            Permission.AppReceiptProcessingSettingsRead,
            Permission.AppOidcProvidersRead,
            Permission.AppSystemTasksRead,
          ],
        },
      },
      {
        path: "users",
        loadChildren: () =>
          import("../user/user.module").then((m) => m.UserModule),
        canActivate: [AuthGuard, appPermissionGuard],
        data: {
          appPermissions: [Permission.AppUsersRead],
        },
      },
      {
        path: "reports",
        loadChildren: () =>
          import("../reports/reports.module").then((m) => m.ReportsModule),
        canActivate: [AuthGuard, appPermissionGuard],
        data: {
          // read OR readAll: an admin with only the "*All" bypass still reaches reports.
          appPermissions: [Permission.AppReportsRead, Permission.AppReportsReadAll],
        },
      },
      {
        path: "",
        redirectTo: "/auth/login",
        pathMatch: "full",
      },
    ],
  },
];

@NgModule({
  // View transitions: a short cross-fade between pages (styled in tailwind.css, off under reduced motion).
  imports: [RouterModule.forRoot(routes, { enableViewTransitions: true })],
  exports: [RouterModule],
})
export class AppRoutingModule {}
