import { ConnectedPosition } from "@angular/cdk/overlay";
import { Component, computed, effect, signal, untracked, ChangeDetectionStrategy } from "@angular/core";
import { Router } from "@angular/router";
import { Store } from "@ngxs/store";
import { take, tap } from "rxjs";
import { LayoutState } from "src/store/layout.state";
import { ViewportService } from "../../services/viewport.service";
import { AuthService, NotificationsService, Permission } from "../../open-api";
import { AuthState, GroupState } from "../../store";
import { marker } from "../../i18n/marker";
import { ThemeService } from "../../theme/theme.service";
import { PALETTES } from "../../theme/themes";

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

  /** Whether the page is at night; follows the mode (and the system on System), so the toggle's icon flips the moment it is used. */
  public readonly isDarkTheme = this.theme.isDark;

  /** The toggle shows (and offers) the mode it would switch to. */
  public readonly themeToggleLabel = computed(() =>
    this.isDarkTheme() ? marker("Switch to day mode") : marker("Switch to night mode")
  );

  /** The colour palettes the menu offers, and the one showing. */
  public readonly palettes = PALETTES;

  public readonly activePalette = this.theme.palette;

  private readonly canReadNotifications = this.store.selectSignal(
    AuthState.hasAppPermission(Permission.AppNotificationsRead)
  );

  constructor(
    private authService: AuthService,
    private notificationsService: NotificationsService,
    private router: Router,
    private store: Store,
    private viewportService: ViewportService,
    private theme: ThemeService
  ) {
    this.listenForLoggedInUser();
  }

  /** Quick switch between day and night; picking one leaves "System" for this browser, like the Theme page does. */
  public toggleTheme(): void {
    this.theme.setMode(this.isDarkTheme() ? "light" : "dark");
  }

  /** The palette menu: applies at once and is remembered, like the Theme page. */
  public pickPalette(key: string): void {
    this.theme.setPalette(key);
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
          ).subscribe();
        });
      }
    });
  }
}
