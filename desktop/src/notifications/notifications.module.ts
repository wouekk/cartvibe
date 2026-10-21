import { AppDatePipe } from "../pipes/app-date.pipe";
import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { HlmButton } from "@spartan-ng/helm/button";
import { RouterModule } from "@angular/router";
import { SharedUiModule } from "src/shared-ui/shared-ui.module";
import { ButtonModule } from "../button";
import { NotificationComponent } from "./notification/notification.component";
import { NotificationsListComponent } from "./notifications-list/notifications-list.component";

@NgModule({
  declarations: [NotificationsListComponent, NotificationComponent],
  imports: [
    AppDatePipe,
    ButtonModule,
    CommonModule,
    HlmButton,
    RouterModule,
    SharedUiModule,
  ],
  exports: [NotificationsListComponent],
})
export class NotificationsModule {}
