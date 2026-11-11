import { ConnectedPosition, CdkOverlayOrigin, CdkConnectedOverlay } from "@angular/cdk/overlay";
import { Component, computed, effect, signal, untracked, ChangeDetectionStrategy, inject } from "@angular/core";
import { Router } from "@angular/router";
import { Store } from "@ngxs/store";
import { take, tap } from "rxjs";
import { LayoutStore } from "src/store/layout.store";
import { ViewportService } from "../../services/viewport.service";
import { AuthService, NotificationsService, Permission } from "../../open-api";
import { AuthState, GroupStore } from "../../store";
import { HlmTooltip } from "@spartan-ng/helm/tooltip";
import { HlmBadge } from "@spartan-ng/helm/badge";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { shownHousehold } from "../../utils/shown-household";
import { AvatarComponent } from "../../avatar/avatar/avatar.component";
import { BrnButton } from "@spartan-ng/brain/button";
import { HlmButton } from "../../ui/button/lib/hlm-button";
import { HlmSidebarTrigger } from "../../ui/sidebar/lib/hlm-sidebar-trigger";
import { HasAppPermissionDirective } from "../../directives/has-app-permission.directive";
import { NgTemplateOutlet } from "@angular/common";
import { CartVibeLogoComponent } from "../../shared-ui/cartvibe-logo/cartvibe-logo.component";
import { NotificationsListComponent } from "../../notifications/notifications-list/notifications-list.component";
import { TranslatePipe } from "../../i18n/translate.pipe";

/** The logo's scale on a phone: 30% of its full size, so it sits compactly in the top bar. */
export const HANDSET_LOGO_SCALE = 0.3;

@Component({
    selector: "app-header",
    templateUrl: "./header.component.html",
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [AvatarComponent, BrnButton, HlmButton, HlmSidebarTrigger, HasAppPermissionDirective, CdkOverlayOrigin, CdkConnectedOverlay, NgTemplateOutlet, CartVibeLogoComponent, NotificationsListComponent, TranslatePipe, HlmTooltip, HlmBadge, AppIconComponent]
})
export class HeaderComponent {
  private readonly groupStore = inject(GroupStore);

  private readonly layoutStore = inject(LayoutStore);

  public isLoggedIn = this.store.selectSignal(AuthState.isLoggedIn);

  public selectedGroupId = this.groupStore.selectedGroupId;

  public loggedInUser = this.store.selectSignal(AuthState.loggedInUser);

  public showProgressBar = this.layoutStore.showProgressBar;

  public settingsBaseHeaderLink = computed(() => {
    this.selectedGroupId();
    return [this.groupStore.settingsLinkBase() + "/view"];
  });

  public groupName = computed(() => {
    const groupId = this.selectedGroupId();
    const group = this.groupStore.getGroupById(groupId);
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

  private readonly groups = this.groupStore.groups;

  public readonly household = computed(() => shownHousehold(this.groups(), Number.parseInt(this.selectedGroupId() ?? "") || 0));

  private readonly canReadNotifications = this.store.selectSignal(
    AuthState.hasAppPermission(Permission.AppNotificationsRead)
  );

  constructor(
    private authService: AuthService,
    private notificationsService: NotificationsService,
    private router: Router,
    private store: Store,
    private viewportService: ViewportService
  ) {
    this.listenForLoggedInUser();
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
