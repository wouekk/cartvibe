import { TestBed } from "@angular/core/testing";
import { Claims } from "../open-api";
import { AuthStore } from "./auth.store";

describe("AuthStore", () => {
  let auth: AuthStore;

  const APP_PERMISSIONS = ["app.users.read", "app.roles.read"];
  const GROUP_PERMISSIONS = { 1: ["group.view", "group.receipts.read"] };
  const GROUP_CATEGORIES = { 1: [{ id: 10, name: "Groceries" }] };
  const GROUP_TAGS = { 1: [{ id: 20, name: "Reimbursable" }] };

  beforeEach(() => {
    auth = TestBed.inject(AuthStore);
  });

  it("setPermissions stores both app and group permissions", () => {
    auth.setPermissions(APP_PERMISSIONS, GROUP_PERMISSIONS);

    expect(auth.appPermissions()).toEqual(APP_PERMISSIONS);
    expect(auth.hasAppPermission("app.users.read")).toBe(true);
    expect(auth.hasGroupPermission(1, "group.view")).toBe(true);
  });

  it("logout clears both permission maps", () => {
    auth.setPermissions(APP_PERMISSIONS, GROUP_PERMISSIONS);
    auth.logout();

    expect(auth.appPermissions()).toEqual([]);
    expect(auth.hasAppPermission("app.users.read")).toBe(false);
    expect(auth.hasGroupPermission(1, "group.view")).toBe(false);
  });

  it("setGroupCatalog stores per-group categories and tags", () => {
    auth.setGroupCatalog(GROUP_CATEGORIES as any, GROUP_TAGS as any);

    expect(auth.groupCategories(1)).toEqual(GROUP_CATEGORIES[1]);
    expect(auth.groupTags(1)).toEqual(GROUP_TAGS[1]);
    // A group with no catalog resolves to an empty list.
    expect(auth.groupCategories(999)).toEqual([]);
  });

  it("logout clears the group catalog", () => {
    auth.setGroupCatalog(GROUP_CATEGORIES as any, GROUP_TAGS as any);
    auth.logout();

    expect(auth.groupCategories(1)).toEqual([]);
    expect(auth.groupTags(1)).toEqual([]);
  });

  it("setAuthState (claims only) does NOT wipe permissions", () => {
    auth.setPermissions(APP_PERMISSIONS, GROUP_PERMISSIONS);

    const claims = {
      userId: 5,
      displayName: "Tester",
      defaultAvatarColor: "#fff",
      username: "tester",
      exp: 9999999999,
    } as Claims;
    auth.setAuthState(claims);

    expect(auth.appPermissions()).toEqual(APP_PERMISSIONS);
    expect(auth.hasAppPermission("app.users.read")).toBe(true);
  });

  it("says so when the session ends, after the session is cleared", () => {
    auth.setAuthState({ userId: 5, exp: 9999999999 } as Claims);
    const seen: boolean[] = [];
    auth.signedOut.subscribe(() => seen.push(auth.isLoggedIn()));

    auth.logout();

    expect(seen).toEqual([false]);
    expect(auth.userId()).toBe("");
  });

  // A computed's answer is remembered until the session changes, and time passing changes nothing there.
  it("reads the clock each time it is asked whether the token has run out", () => {
    expect(auth.isAccessTokenExpired()).toBe(true);

    auth.setAuthState({ userId: 5, exp: 2000 } as Claims);

    expect(auth.tokenExpiresAt()).toBe(2_000_000);
    expect(auth.isAccessTokenExpired(1_999_999)).toBe(false);
    expect(auth.isAccessTokenExpired(2_000_000)).toBe(true);
  });

  describe("closeChipSelectOnSelect", () => {
    it("defaults to false when there are no user preferences", () => {
      expect(auth.closeChipSelectOnSelect()).toBe(false);
    });

    it("defaults to false when the preference is absent from stored preferences", () => {
      auth.setUserPreferences({ quickScanDefaultGroupId: 1 } as any);

      expect(auth.closeChipSelectOnSelect()).toBe(false);
    });

    it("reflects the stored preference", () => {
      auth.setUserPreferences({ closeChipSelectOnSelect: true } as any);

      expect(auth.closeChipSelectOnSelect()).toBe(true);
    });
  });

  describe("readers", () => {
    beforeEach(() => {
      auth.setPermissions(APP_PERMISSIONS, GROUP_PERMISSIONS);
    });

    it("hasAppPermission denies a permission the user does not hold", () => {
      expect(auth.hasAppPermission("app.users.delete")).toBe(false);
    });

    it("hasAnyAppPermission returns true when at least one matches", () => {
      expect(
        auth.hasAnyAppPermission(["app.users.delete", "app.roles.read"])
      ).toBe(true);
    });

    it("hasAnyAppPermission returns false when none match", () => {
      expect(
        auth.hasAnyAppPermission(["app.users.delete", "app.users.create"])
      ).toBe(false);
    });

    it("hasGroupPermission checks the group's permission list", () => {
      expect(auth.hasGroupPermission(1, "group.receipts.read")).toBe(true);
      expect(auth.hasGroupPermission(1, "group.receipts.update")).toBe(false);
      // Non-member group resolves to deny.
      expect(auth.hasGroupPermission(2, "group.view")).toBe(false);
    });

    it("hasGroupPermission orApp override grants access to a non-member holding the app perm", () => {
      // group 2 has no permissions, but the app fallback is held → allowed.
      expect(
        auth.hasGroupPermission(2, "group.view", ["app.users.read"])
      ).toBe(true);
    });

    it("hasGroupPermission orApp override does not grant when the app perm is absent", () => {
      expect(
        auth.hasGroupPermission(2, "group.view", ["app.groups.read"])
      ).toBe(false);
    });

    it("hasGroupPermission coerces string JSON keys to numeric index access", () => {
      // Persisted/JSON-revived state has string keys; numeric-id lookup must still resolve.
      auth.setPermissions(APP_PERMISSIONS, { ["3" as any]: ["group.view"] });
      expect(auth.hasGroupPermission(3, "group.view")).toBe(true);
    });
  });
});
