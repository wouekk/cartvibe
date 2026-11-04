import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { Store } from "@ngxs/store";
import { buttonVariants, HlmButton } from "@spartan-ng/helm/button";
import { filter, Observable, take } from "rxjs";
import { AvatarModule } from "../../avatar/avatar.module";
import { DEFAULT_DIALOG_CONFIG } from "../../constants";
import { AppDialog } from "../../dialog/app-dialog";
import { marker } from "../../i18n/marker";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { AvatarResponse, Permission, User, UserService } from "../../open-api";
import { SnackbarService } from "../../services/snackbar.service";
import { ConfirmationDialogComponent } from "../../shared-ui/confirmation-dialog/confirmation-dialog.component";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { SharedUiModule } from "../../shared-ui/shared-ui.module";
import { AuthState, UpdateUser } from "../../store";
import { UserState } from "../../store/user.state";
import { downscaleImageForUpload } from "../../utils/downscale-image";

/** An avatar is drawn at most a few rem wide: 512px stays sharp on a 3x screen and goes up in tens of kilobytes. */
export const AVATAR_MAX_SIDE = 512;
/** The server's cap (MaxAvatarBytes); checked here too so a too-large file is refused without waiting for the upload. */
export const AVATAR_MAX_BYTES = 8 * 1024 * 1024;

/**
 * The person's avatar photo on their profile: take one with the camera or pick a file, or remove it to show the
 * initials again. Each photo button is a native <label> around a hidden file input (mobile browsers drop a click made
 * after an await). A large photo is shrunk in the browser before it goes up.
 */
@Component({
  selector: "app-avatar-photo",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block" },
  imports: [AvatarModule, SharedUiModule, HlmButton, AppIconComponent, TranslatePipe],
  templateUrl: "./avatar-photo.component.html",
})
export class AvatarPhotoComponent {
  private readonly store = inject(Store);
  private readonly userService = inject(UserService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly dialog = inject(AppDialog);

  private readonly loggedInUser = this.store.selectSignal(AuthState.loggedInUser);
  private readonly users = this.store.selectSignal(UserState.users);

  public readonly canEdit = this.store.selectSignal(AuthState.hasAppPermission(Permission.AppAccountUpdate));

  /** The signed-in person as the household's user list has them (it carries avatarUpdatedAt). */
  public readonly me = computed<User>(() => {
    const self = this.loggedInUser();
    const known = (this.users() ?? []).find((user) => Number(user.id) === Number(self.id));
    return { ...self, ...(known ?? {}), displayName: self.displayName || known?.displayName || "" } as User;
  });

  public readonly hasPhoto = computed(() => !!this.me().avatarUpdatedAt);

  public readonly saving = signal(false);

  /** The labels look like the app's buttons; they stay labels for the reason above. */
  protected readonly primaryButtonClass = buttonVariants({ variant: "default" });
  protected readonly outlineButtonClass = buttonVariants({ variant: "outline" });

  protected async selected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Cleared so picking the same photo again still fires a change.
    input.value = "";
    if (!file || this.saving()) {
      return;
    }

    this.saving.set(true);
    const photo = await downscaleImageForUpload(file, { maxSide: AVATAR_MAX_SIDE, minBytes: 0 });
    if (photo.size > AVATAR_MAX_BYTES) {
      this.saving.set(false);
      this.snackbarService.error(marker("The photo is too large: 8 MB at most."));
      return;
    }
    this.save(this.userService.uploadAvatar(photo), marker("Photo saved"));
  }

  public remove(): void {
    const ref = this.dialog.open(ConfirmationDialogComponent, DEFAULT_DIALOG_CONFIG);
    ref.componentInstance.headerText = marker("Remove photo");
    ref.componentInstance.confirmText = marker("Remove");
    ref.componentInstance.dialogContent = marker("Your initials will show instead of your photo.");
    ref
      .afterClosed()
      .pipe(filter((confirmed) => !!confirmed))
      .subscribe(() => {
        this.saving.set(true);
        this.save(this.userService.deleteAvatar(), marker("Photo removed"));
      });
  }

  private save(request: Observable<AvatarResponse>, successMessage: string): void {
    request.pipe(take(1)).subscribe({
      next: (response) => {
        this.saving.set(false);
        const me = this.me();
        // Every avatar of this person follows the list, so the new photo (or the initials) shows everywhere at once.
        this.store.dispatch(new UpdateUser(String(me.id), { ...me, avatarUpdatedAt: response.avatarUpdatedAt ?? undefined }));
        this.snackbarService.success(successMessage);
      },
      // The interceptor toasts the server's message.
      error: () => this.saving.set(false),
    });
  }
}
