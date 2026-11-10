import { ConnectedPosition } from "@angular/cdk/overlay";
import { Component, computed, effect, signal, untracked, ChangeDetectionStrategy } from "@angular/core";
import { Location } from "@angular/common";
import { Router } from "@angular/router";
import { Store } from "@ngxs/store";
import { take, tap } from "rxjs";
import { LayoutState } from "src/store/layout.state";
import { ViewportService } from "../../services/viewport.service";
import { AuthService, NotificationsService, Permission } from "../../open-api";
import { AuthState, GroupState } from "../../store";
import { shownHousehold } from "../../utils/shown-household";

/** The logo's scale on a phone: 30% of its full size, so it sits compactly in the top bar. */
export const HANDSET_LOGO_SCALE = 0.3;

@Component({
    selector: "app-header",
    templateUrl: "./header.component.html",
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class HeaderComponent {
  public isLoggedIn = this.store.selectSignal(AuthState.isLoggedIn);

  public selectedGroupId = this.store.selectSignal(GroupState.selectedGroupId);

  public loggedInUser = this.store.selectSignal(AuthState.loggedInUser);

  public showProgressBar = this.store.selectSignal(LayoutState.showProgressBar);

  public userPreferences = this.store.selectSignal(AuthState.userPreferences);

  public settingsBaseHeaderLink = computed(() => {
    this.selectedGroupId();
    return [this.store.selectSnapshot(GroupState.settingsLinkBase) + "/view"];
  });

  public groupName = computed(() => {
    const groupId = this.selectedGroupId();
    const group = this.store.selectSnapshot(GroupState.getGroupById(groupId));
    return group?.name as string ?? "";
  });

  public notificationCount = signal<number | undefined>(undefined);

  public readonly notificationsOpen = signal(false);

  public readonly notificationPositions: ConnectedPosition[] = [
    { originX: "end", originY: "bottom", overlayX: "end", overlayY: "top", offsetY: 8 },
  ];

  protected readonly Permission = Permission;

  public readonly logoScale = computed(() => (this.viewportService.isHandset() ? HANDSET_LOGO_SCALE : 1));

  /** A phone has no sidebar button here (the tab bar's More opens the sheet); it names the household instead. */
  public readonly isHandset = this.viewportService.isHandset;

  private readonly groups = this.store.selectSignal(GroupState.groups);

  public readonly household = computed(() => shownHousehold(this.groups(), Number.parseInt(this.selectedGroupId() ?? "") || 0));

  private readonly canReadNotifications = this.store.selectSignal(
    AuthState.hasAppPermission(Permission.AppNotificationsRead)
  );

  constructor(
    private authService: AuthService,
    private notificationsService: NotificationsService,
    private router: Router,
    private store: Store,
    private viewportService: ViewportService,
    private location: Location
  ) {
    this.listenForLoggedInUser();
  }

  /**
   * An in-app shortcut ("/receipts") goes through the location strategy, so it keeps the base href and the hash
   * (the demo lives under /demo/#/); the app itself is unchanged. Other addresses are left alone.
   */
  public shortcutHref(url: string | undefined): string {
    if (!url) {
      return "";
    }
    return url.startsWith("/") && !url.startsWith("//") ? this.location.prepareExternalUrl(url) : url;
  }

  private listenForLoggedInUser(): void {
    let fetched = false;
    effect(() => {
      const loggedIn = this.isLoggedIn();
      const canRead = this.canReadNotifications();
      if (!loggedIn) {
        fetched = false;
        return;
      }
      if (canRead && !fetched) {
        fetched = true;
        untracked(() => {
          this.notificationsService.getNotificationCount().pipe(
            take(1),
            tap((n) => {
              this.notificationCount.set(n > 0 ? n : undefined);
            })
            // An app opened without a connection has no count to show; that is not an error to throw.
          ).subscribe({ error: () => undefined });
        });
      }
    });
  }
}
