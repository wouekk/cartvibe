import { Component, effect, signal } from "@angular/core";
import { Router } from "@angular/router";
import { Store } from "@ngxs/store";
import { take, tap } from "rxjs";
import { LayoutState } from "src/store/layout.state";
import { ToggleIsSidebarOpen } from "src/store/layout.state.actions";
import { AuthService, GroupRole, NotificationsService } from "../../open-api";
import { AuthState, GroupState } from "../../store";

@Component({
    selector: "app-header",
    templateUrl: "./header.component.html",
    styleUrls: ["./header.component.scss"],
    standalone: false
})
export class HeaderComponent {
  public isLoggedIn = this.store.selectSignal(AuthState.isLoggedIn);

  public selectedGroupId = this.store.selectSignal(GroupState.selectedGroupId);

  public loggedInUser = this.store.selectSignal(AuthState.loggedInUser);

  public showProgressBar = this.store.selectSignal(LayoutState.showProgressBar);

  public userPreferences = this.store.selectSignal(AuthState.userPreferences);

  public receiptHeaderLink = signal<string[]>([""]);

  public dashboardHeaderLink = signal<string[]>([""]);

  public settingsBaseHeaderLink = signal<string[]>([""]);

  public groupName = signal("");

  public groupRoleEnum = GroupRole;

  public notificationCount = signal<number | undefined>(undefined);

  constructor(
    private authService: AuthService,
    private notificationsService: NotificationsService,
    private router: Router,
    private store: Store
  ) {
    this.setGroupData();
    this.listenForLoggedInUser();
  }

  private setGroupData(): void {
    effect(() => {
      const groupId = this.selectedGroupId();
      this.receiptHeaderLink.set([
        this.store.selectSnapshot(GroupState.receiptListLink),
      ]);
      this.dashboardHeaderLink.set([
        this.store.selectSnapshot(GroupState.dashboardLink),
      ]);
      this.settingsBaseHeaderLink.set([
        this.store.selectSnapshot(GroupState.settingsLinkBase) + "/view",
      ]);
      const newGroup = this.store.selectSnapshot(
        GroupState.getGroupById(groupId)
      );
      this.groupName.set(newGroup?.name as string);
    });
  }

  private listenForLoggedInUser(): void {
    effect(() => {
      const loggedIn = this.isLoggedIn();
      if (loggedIn) {
        this.notificationsService.getNotificationCount().pipe(
          take(1),
          tap((n) => {
            if (n > 0) {
              this.notificationCount.set(n);
            } else {
              this.notificationCount.set(undefined);
            }
          })
        ).subscribe();
      }
    });
  }

  public toggleSidebar(): void {
    this.store.dispatch(new ToggleIsSidebarOpen());
  }
}
