import { NgModule } from "@angular/core";
import { RouterModule, Routes } from "@angular/router";
import { GroupGuard } from "../guards/group.guard";
import { overviewReadGuard } from "./guards/overview-read.guard";
import { OverviewPageComponent } from "./overview-page/overview-page.component";

const routes: Routes = [
  {
    // The customise screen is the Dashboard itself in edit mode (same guards), so the preview shows the real figures.
    path: "group/:groupId/customize",
    component: OverviewPageComponent,
    canActivate: [GroupGuard, overviewReadGuard],
    data: {
      groupGuardBasePath: "/overview/group",
      customise: true,
    },
  },
  {
    path: "group/:groupId",
    component: OverviewPageComponent,
    // GroupGuard first: it redirects an unknown group id and syncs the selected group.
    canActivate: [GroupGuard, overviewReadGuard],
    data: {
      groupGuardBasePath: "/overview/group",
    },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class OverviewRoutingModule {}
