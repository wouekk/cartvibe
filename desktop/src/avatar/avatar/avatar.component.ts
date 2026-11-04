import { Component, computed, inject, input, signal, ChangeDetectionStrategy } from "@angular/core";
import { Store } from "@ngxs/store";
import { Group, User } from "../../open-api";
import { UserState } from "../../store/user.state";

/** The address of a person's avatar photo; the version makes a new photo a new address (the browser caches a day). */
export function avatarPhotoUrl(userId: number, avatarUpdatedAt: string): string {
  return `/api/user/${userId}/avatar?v=${encodeURIComponent(avatarUpdatedAt)}`;
}

/**
 * A person's photo when they uploaded one, otherwise the first letter of their name (or a group's) on their colour.
 * The photo's version comes from the user given or, when that has none (the signed-in user from the token), from the
 * household's user list, so a new photo shows everywhere at once. A photo that fails to load falls back to the letter.
 */
@Component({
    selector: "app-avatar",
    templateUrl: "./avatar.component.html",
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class AvatarComponent {
  public readonly user = input<User>();
  public readonly group = input<Group>();

  private readonly store = inject(Store, { optional: true });

  private readonly users = this.store?.selectSignal(UserState.users) ?? signal<User[]>([]);

  public readonly photoUrl = computed(() => {
    const user = this.user();
    const id = Number(user?.id);
    if (!user || !id) {
      return null;
    }
    const version = user.avatarUpdatedAt ?? (this.users() ?? []).find((known) => Number(known.id) === id)?.avatarUpdatedAt;
    return version ? avatarPhotoUrl(id, version) : null;
  });

  /** The address that failed to load; a new photo (a new address) is tried again. */
  public readonly failedUrl = signal<string | null>(null);

  public readonly showPhoto = computed(() => {
    const url = this.photoUrl();
    return !!url && url !== this.failedUrl();
  });
}
