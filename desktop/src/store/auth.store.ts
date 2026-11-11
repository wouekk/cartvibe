import { computed, Injectable } from "@angular/core";
import { Subject } from "rxjs";
import { Category, Claims, Icon, Tag, UserPreferences } from "../open-api";
import { User } from "../open-api/model/user";
import { hasAll, hasAny } from "../utils/permission.utils";
import { AuthStateInterface } from "./auth-state.interface";
import { StateStore } from "./state-store";

/**
 * The session in this browser: who is signed in, what they may do, their preferences, and each household's
 * categories and tags. Kept between visits, so the app starts on it before the server has answered.
 *
 * The permissions are set by `AppDataService` alone; the server re-checks every one (`api/docs/authorization.md`).
 */
@Injectable({ providedIn: "root" })
export class AuthStore extends StateStore<AuthStateInterface> {
  /** Says so once the session has ended, so the other stores drop what belonged to the account. */
  public readonly signedOut = new Subject<void>();

  public readonly userPreferences = computed((): UserPreferences | undefined => this.state().userPreferences);

  /**
   * Whether a multi-select chip field should close its option list after each
   * selection. The default - and so the behavior of every install that has not
   * opted in - is to leave it open. Kept as its own signal so that default
   * lives in one place rather than at each reader.
   */
  public readonly closeChipSelectOnSelect = computed(() => this.state().userPreferences?.closeChipSelectOnSelect ?? false);

  public readonly icons = computed((): Icon[] => this.state().icons ?? []);

  /**
   * A session exists in this browser: the person signed in and has not signed out. The 20-minute access token may
   * have run out meanwhile (a phone asleep or without signal); `TokenRefreshService` renews it, and only the server's
   * refusal ends the session. Use `isAccessTokenExpired()` to decide whether a renewal is due.
   */
  public readonly isLoggedIn = computed(() => !!this.state().expirationDate);

  public readonly userId = computed(() => this.state().userId ?? "");

  /** When the access token runs out, in milliseconds since the epoch; undefined without a session. */
  public readonly tokenExpiresAt = computed((): number | undefined => {
    const expirationDate = this.state().expirationDate;
    return expirationDate ? Number(expirationDate) * 1000 : undefined;
  });

  public readonly loggedInUser = computed((): User => {
    const state = this.state();
    return {
      defaultAvatarColor: state.defaultAvatarColor ?? "",
      displayName: state.displayname ?? "",
      id: Number(state.userId) ?? "",
      username: state.username ?? "",
    } as User;
  });

  public readonly appPermissions = computed((): string[] => this.state().appPermissions ?? []);

  public readonly groupPermissions = computed((): { [groupId: number]: string[] } => this.state().groupPermissions ?? {});

  /** Every group's categories and tags, for a signal that follows an input group id (see groupCategories). */
  public readonly groupCatalog = computed((): { categories: { [groupId: number]: Category[] }; tags: { [groupId: number]: Tag[] } } => {
    const state = this.state();
    return { categories: state.groupCategories ?? {}, tags: state.groupTags ?? {} };
  });

  constructor() {
    super(() => ({}), "auth");
  }

  /**
   * Whether the access token has run out (or there is none). A method that reads the clock on each call, never a
   * `computed`: a computed's answer is remembered until the session changes, and time passing changes nothing there.
   */
  public isAccessTokenExpired(now: number = Date.now()): boolean {
    const expiresAt = this.tokenExpiresAt();
    return expiresAt === undefined || now >= expiresAt;
  }

  // The readers below take an argument and read the signal, so each follows the session inside a `computed`.

  public groupCategories(groupId: number): Category[] {
    return this.state().groupCategories?.[groupId] ?? [];
  }

  public groupTags(groupId: number): Tag[] {
    return this.state().groupTags?.[groupId] ?? [];
  }

  public hasAppPermission(permission: string): boolean {
    return hasAll(this.appPermissions(), permission);
  }

  public hasAnyAppPermission(permissions: string[]): boolean {
    return hasAny(this.appPermissions(), ...permissions);
  }

  public hasGroupPermission(groupId: number, permission: string, orAppPermissions: string[] = []): boolean {
    if (orAppPermissions.length > 0 && hasAny(this.appPermissions(), ...orAppPermissions)) {
      return true;
    }
    return hasAll(this.groupPermissions()[groupId] ?? [], permission);
  }

  public setAuthState(claims: Claims): void {
    this.patch({
      defaultAvatarColor: claims.defaultAvatarColor,
      displayname: claims.displayName,
      expirationDate: claims?.exp?.toString(),
      userId: claims?.userId?.toString(),
      username: claims?.username,
    });
  }

  public setPermissions(appPermissions: string[], groupPermissions: { [groupId: number]: string[] }): void {
    this.patch({ appPermissions, groupPermissions });
  }

  public setGroupCatalog(groupCategories: { [groupId: number]: Category[] }, groupTags: { [groupId: number]: Tag[] }): void {
    this.patch({ groupCategories, groupTags });
  }

  public setUserPreferences(userPreferences: UserPreferences): void {
    this.patch({ userPreferences });
  }

  public setIcons(icons: Icon[]): void {
    this.patch({ icons });
  }

  /** Ends the session in this browser. The icons stay: they are the server's, not the account's. */
  public logout(): void {
    this.patch({
      defaultAvatarColor: "",
      displayname: "",
      expirationDate: "",
      userId: "",
      username: "",
      userPreferences: undefined,
      appPermissions: undefined,
      groupPermissions: undefined,
      groupCategories: undefined,
      groupTags: undefined,
    });
    this.signedOut.next();
  }
}
