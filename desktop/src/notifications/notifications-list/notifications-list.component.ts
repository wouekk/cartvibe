import { Component, OnInit, signal } from "@angular/core";
import { take, tap } from "rxjs";
import { Notification, NotificationsService } from "../../open-api";

@Component({
    selector: "app-notifications-list",
    templateUrl: "./notifications-list.component.html",
    styleUrls: ["./notifications-list.component.scss"],
    standalone: false
})
export class NotificationsListComponent implements OnInit {
  public notifications = signal<Notification[]>([]);

  constructor(private notificationsService: NotificationsService) {}

  public ngOnInit(): void {
    this.getNotifications();
  }

  private getNotifications(): void {
    this.notificationsService
      .getNotificationsForuser()
      .pipe(
        take(1),
        tap((notifications) => {
          this.notifications.set(notifications);
        })
      )
      .subscribe();
  }

  public deleteAllNotifications(): void {
    this.notificationsService
      .deleteAllNotificationsForUser()
      .pipe(
        take(1),
        tap(() => {
          this.notifications.set([]);
        })
      )
      .subscribe();
  }

  public notificationDeleted(id: number): void {
    this.notifications.set(this.notifications().filter((n) => n.id !== id));
  }
}
