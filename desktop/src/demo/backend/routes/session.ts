import {
  AppData,
  Claims,
  CurrencySeparator,
  CurrencySymbolPosition,
  Notification,
  Permission,
  PermissionDescriptor,
  PermissionScope,
  UpdateDashboardLayoutCommand,
  UserPreferences,
} from "../../../open-api";
import { DemoDb, nextId } from "../db";
import { DemoRouter } from "../router";
import { badRequest, body, idParam, notFound, ok } from "../http";

/** The sample session never expires within a visit; the page reloads it on every start. */
const SESSION_SECONDS = 60 * 60 * 24 * 365;

export function claimsFor(db: DemoDb): Claims {
  const user = db.users.find((candidate) => candidate.id === db.currentUserId) ?? db.users[0];
  return {
    userId: user.id,
    displayName: user.displayName,
    defaultAvatarColor: user.defaultAvatarColor ?? "",
    username: user.username,
    iss: "https://cartvibe.app",
    exp: Math.floor(Date.parse(`${db.today}T00:00:00Z`) / 1000) + SESSION_SECONDS,
  };
}

const ICONS = [
  ["receipt_long", "Long Receipt"],
  ["shopping_cart", "Shopping Cart"],
  ["home", "Home"],
  ["restaurant", "Restaurant"],
  ["family_restroom", "Family"],
  ["savings", "Savings"],
].map(([value, displayValue]) => ({ value, displayValue }));

/** The signed-in sample user is an Admin: every permission the API knows. */
const ALL_PERMISSIONS = Object.values(Permission);
const APP_PERMISSIONS = ALL_PERMISSIONS.filter((permission) => permission.startsWith("app."));
const GROUP_PERMISSIONS = ALL_PERMISSIONS.filter((permission) => permission.startsWith("group."));

export function buildAppData(db: DemoDb): AppData {
  const groupIds = db.groups.map((group) => group.id);
  const groupMap = <T>(value: T): Record<string, T> => Object.fromEntries(groupIds.map((id) => [id, value]));

  return {
    about: { version: "demo", buildDate: db.today },
    claims: claimsFor(db),
    groups: db.groups,
    users: db.users,
    userPreferences: db.preferences,
    featureConfig: featureConfig(),
    categories: db.categories,
    tags: db.tags,
    currencyDisplay: db.settings.currencyDisplay ?? "",
    currencyThousandthsSeparator: db.settings.currencyThousandthsSeparator ?? CurrencySeparator.Comma,
    currencyDecimalSeparator: db.settings.currencyDecimalSeparator ?? CurrencySeparator.Period,
    currencySymbolPosition: db.settings.currencySymbolPosition ?? CurrencySymbolPosition.Start,
    currencyHideDecimalPlaces: db.settings.currencyHideDecimalPlaces ?? false,
    timeZone: db.settings.timeZone ?? "UTC",
    dateFormat: db.settings.dateFormat ?? "DD/MM/YYYY",
    icons: ICONS,
    appPermissions: APP_PERMISSIONS,
    groupPermissions: groupMap(GROUP_PERMISSIONS),
    groupReceiptRequirements: {},
    groupCategories: groupMap(db.categories),
    groupTags: groupMap(db.tags),
  };
}

export function featureConfig() {
  return {
    // The "scan" is scripted, but the app should offer it, so the AI-powered entry points show.
    aiPoweredReceipts: true,
    enableLocalSignUp: false,
    oidcProviders: [],
    shopLogosEnabled: false,
    webPushPublicKey: "",
  };
}

function permissionDescriptors(): PermissionDescriptor[] {
  return ALL_PERMISSIONS.map((key) => ({
    key,
    label: key,
    description: key,
    category: key.split(".")[1] ?? "",
    scope: key.startsWith("app.") ? PermissionScope.App : PermissionScope.Group,
  }));
}

export function registerSession(router: DemoRouter): void {
  router.post("/login", ({ db }) => ok(buildAppData(db)));
  router.post("/logout", () => ok());
  router.post("/signUp", () => badRequest("Sign up is switched off in the demo."));
  router.post("/token", ({ db }) => ({ ...claimsFor(db), jwt: "demo", refreshToken: "demo" }));
  router.get("/user/appData", ({ db }) => buildAppData(db));
  router.get("/user/getUserClaims", ({ db }) => claimsFor(db));
  router.get("/featureConfig", () => featureConfig());
  router.get("/permission", () => permissionDescriptors());

  router.get("/userPreferences", ({ db }) => db.preferences);
  router.put("/userPreferences", (ctx) => {
    // The whole object replaces the stored one, as on the real API.
    const sent = body<UserPreferences>(ctx);
    ctx.db.preferences = { ...ctx.db.preferences, ...sent, id: ctx.db.preferences.id, userId: ctx.db.preferences.userId };
    return ctx.db.preferences;
  });

  router.get("/dashboardLayout", ({ db }) => db.dashboardLayout);
  router.put("/dashboardLayout", (ctx) => {
    ctx.db.dashboardLayout = { ...ctx.db.dashboardLayout, layout: body<UpdateDashboardLayoutCommand>(ctx).layout };
    return ctx.db.dashboardLayout;
  });

  router.get("/notifications/notificationCount", ({ db }) => db.notifications.length);
  router.post("/notifications/pushSubscription", () => ok());
  router.post("/notifications/pushSubscription/remove", () => ok());
  router.get("/notifications", ({ db }) => [...db.notifications].reverse());
  router.delete("/notifications", (ctx) => {
    ctx.db.notifications = [];
    return ok();
  });
  router.delete("/notifications/:id", (ctx) => {
    ctx.db.notifications = ctx.db.notifications.filter((notification) => notification.id !== idParam(ctx, "id"));
    return ok();
  });

  router.put("/user/updateUserProfile", (ctx) => {
    const user = ctx.db.users.find((candidate) => candidate.id === ctx.db.currentUserId);
    if (!user) {
      return notFound("User not found");
    }
    const { displayName, defaultAvatarColor } = body<{ displayName: string; defaultAvatarColor: string }>(ctx);
    user.displayName = displayName;
    user.defaultAvatarColor = defaultAvatarColor;
    return ok(claimsFor(ctx.db));
  });
  router.post("/user/deleteAccount", () => badRequest("The sample account cannot be deleted in the demo."));
  // The demo keeps no files, so its people keep their initials.
  router.put("/user/avatar", () => badRequest("Photos are not kept in the demo."));
  router.delete("/user/avatar", () => ok({ avatarUpdatedAt: null }));
  router.get("/user/:userId/avatar", () => notFound("No photo"));
}

/**
 * Adds a notification for the signed-in user, for the scripted scan and Going shopping. The title and body are worded and
 * tokenised as the API writes them (`${userId:2.displayName:string}`), so the app translates and links them as usual.
 */
export function notify(db: DemoDb, title: string, text: string): Notification {
  const notification: Notification = {
    id: nextId(db, "notification"),
    userId: db.currentUserId,
    type: "NORMAL",
    title,
    body: text,
    createdAt: `${db.today}T12:00:00Z`,
  };
  db.notifications.push(notification);
  return notification;
}
