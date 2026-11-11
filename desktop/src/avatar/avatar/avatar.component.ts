import { Component, computed, inject, input, signal, ChangeDetectionStrategy } from "@angular/core";
import { Store } from "@ngxs/store";
import { Group, User } from "../../open-api";
import { UserState } from "../../store/user.state";
import { groupColorStyle, isGroupIcon } from "../../constants/group-look";
import { BrnTooltip } from "@spartan-ng/brain/tooltip";
import { HlmTooltip } from "../../ui/tooltip/lib/hlm-tooltip";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { SlicePipe } from "@angular/common";

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
    imports: [BrnTooltip, HlmTooltip, AppIconComponent, SlicePipe]
})
export class AvatarComponent {
  public readonly user = input<User>();
  public readonly group = input<Group>();
  /** "md" (3.125rem, the default), "sm" (a list row) or "xs" (a menu entry). */
  public readonly size = input<"md" | "sm" | "xs">("md");

  public readonly sizeClass = computed(() => {
    switch (this.size()) {
      case "sm":
        return "size-8 text-sm";
      case "xs":
        return "size-6 text-xs";
      default:
        return "size-[3.125rem]";
    }
  });

  /** The household icon follows the circle: a little larger than its letter. */
  public readonly iconClass = computed(() => (this.size() === "md" ? "text-2xl" : this.size() === "sm" ? "text-base" : "text-sm"));

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

  /** A household's chosen icon, when it has one (users never do; the "All" group never gets one). */
  public readonly groupIcon = computed(() => {
    const group = this.user() ? undefined : this.group();
    return group && isGroupIcon(group.icon) ? group.icon! : null;
  });

  private readonly groupLook = computed(() => (this.user() ? null : groupColorStyle(this.group()?.color)));

  public readonly background = computed(() => this.user()?.defaultAvatarColor || this.groupLook()?.background || null);

  public readonly foreground = computed(() => {
    if (this.user()?.defaultAvatarColor) {
      return "#ffffff";
    }
    return this.groupLook()?.foreground ?? null;
  });

  public readonly showPhoto = computed(() => {
    const url = this.photoUrl();
    return !!url && url !== this.failedUrl();
  });
}
