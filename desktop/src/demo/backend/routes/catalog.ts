import {
  Category,
  CategoryView,
  Group,
  GroupFilter,
  Tag,
  TagView,
  UpdateGroupMemberGrantsCommand,
  UpdateGroupReceiptSettingsCommand,
  UpsertCategoryCommand,
  UpsertGroupCommand,
  UpsertTagCommand,
  UserView,
} from "../../../open-api";
import { DemoDb, nextId } from "../db";
import { DemoRouter } from "../router";
import { PagedRequest, paginate } from "../paging";
import { badRequest, body, idParam, notFound, ok } from "../http";
import { DEMO_APP_USER_ROLE_ID } from "../seed";

function receiptsUsingCategory(db: DemoDb, categoryId: number): number {
  const ids = new Set(db.products.filter((product) => product.categoryId === categoryId).map((product) => product.receiptId));
  return ids.size;
}

function receiptsUsingTag(db: DemoDb, tagId: number): number {
  const ids = new Set(
    db.products.filter((product) => product.tags.some((tag) => tag.id === tagId)).map((product) => product.receiptId),
  );
  db.receipts.filter((receipt) => receipt.tags.some((tag) => tag.id === tagId)).forEach((receipt) => ids.add(receipt.id));
  return ids.size;
}

export function categoryViews(db: DemoDb): CategoryView[] {
  return db.categories.map((category) => ({
    ...category,
    id: category.id ?? 0,
    name: category.name ?? "",
    numberOfProducts: db.products.filter((product) => product.categoryId === category.id).length,
    numberOfReceipts: receiptsUsingCategory(db, category.id ?? 0),
  }));
}

function tagViews(db: DemoDb): TagView[] {
  return db.tags.map((tag) => ({
    ...tag,
    id: tag.id ?? 0,
    numberOfProducts: db.products.filter((product) => product.tags.some((candidate) => candidate.id === tag.id)).length,
    numberOfReceipts: receiptsUsingTag(db, tag.id ?? 0),
  }));
}

function sameName(a: string | undefined, b: string): boolean {
  return (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();
}

export function registerCatalog(router: DemoRouter): void {
  // Categories
  router.post("/category/getPagedCategories", (ctx) => paginate(categoryViews(ctx.db), body<PagedRequest>(ctx), "name"));
  router.get("/category", ({ db }) => db.categories);
  router.get("/category/:name", (ctx) => ctx.db.categories.filter((category) => sameName(category.name, ctx.params["name"])).length);
  router.post("/category", (ctx) => {
    const command = body<UpsertCategoryCommand>(ctx);
    const category: Category = {
      id: nextId(ctx.db, "category"),
      name: command.name,
      description: command.description ?? "",
      skipped: command.skipped ?? false,
      aliases: "",
      createdAt: `${ctx.db.today}T12:00:00Z`,
    };
    ctx.db.categories.push(category);
    return category;
  });
  router.put("/category/:categoryId", (ctx) => {
    const category = ctx.db.categories.find((candidate) => candidate.id === idParam(ctx, "categoryId"));
    if (!category) {
      return notFound("Category not found");
    }
    const command = body<UpsertCategoryCommand>(ctx);
    Object.assign(category, { name: command.name, description: command.description ?? "", skipped: command.skipped ?? false });
    // A line carries its category's name alongside the id, so a rename follows.
    ctx.db.products.filter((product) => product.categoryId === category.id).forEach((product) => (product.foodGroup = command.name));
    return category;
  });
  router.delete("/category/:categoryId", (ctx) => {
    const id = idParam(ctx, "categoryId");
    ctx.db.categories = ctx.db.categories.filter((category) => category.id !== id);
    ctx.db.products
      .filter((product) => product.categoryId === id)
      .forEach((product) => {
        product.categoryId = undefined;
        product.foodGroup = "";
      });
    return ok();
  });

  // Tags
  router.post("/tag/getPagedTags", (ctx) => paginate(tagViews(ctx.db), body<PagedRequest>(ctx), "name"));
  router.get("/tag", ({ db }) => db.tags);
  router.get("/tag/:name", (ctx) => ctx.db.tags.filter((tag) => sameName(tag.name, ctx.params["name"])).length);
  router.post("/tag", (ctx) => {
    const command = body<UpsertTagCommand>(ctx);
    const tag: Tag = {
      id: nextId(ctx.db, "tag"),
      name: command.name,
      description: command.description ?? "",
      showOnDashboard: command.showOnDashboard ?? false,
      createdAt: `${ctx.db.today}T12:00:00Z`,
    };
    ctx.db.tags.push(tag);
    return tag;
  });
  router.put("/tag/:tagId", (ctx) => {
    const tag = ctx.db.tags.find((candidate) => candidate.id === idParam(ctx, "tagId"));
    if (!tag) {
      return notFound("Tag not found");
    }
    const command = body<UpsertTagCommand>(ctx);
    Object.assign(tag, { name: command.name, description: command.description ?? "", showOnDashboard: command.showOnDashboard ?? false });
    const rename = (candidate: Tag): Tag => (candidate.id === tag.id ? { ...tag } : candidate);
    ctx.db.products.forEach((product) => (product.tags = product.tags.map(rename)));
    ctx.db.receipts.forEach((receipt) => (receipt.tags = receipt.tags.map(rename)));
    return tag;
  });
  router.delete("/tag/:tagId", (ctx) => {
    const id = idParam(ctx, "tagId");
    ctx.db.tags = ctx.db.tags.filter((tag) => tag.id !== id);
    ctx.db.products.forEach((product) => (product.tags = product.tags.filter((tag) => tag.id !== id)));
    ctx.db.receipts.forEach((receipt) => (receipt.tags = receipt.tags.filter((tag) => tag.id !== id)));
    return ok();
  });

  // Groups (households)
  router.get("/group", ({ db }) => db.groups);
  router.post("/group/getPagedGroups", (ctx) => {
    const request = body<PagedRequest & { filter?: GroupFilter }>(ctx);
    return paginate(ctx.db.groups, request, "name");
  });
  router.get("/group/:groupId", (ctx) => ctx.db.groups.find((group) => group.id === idParam(ctx, "groupId")) ?? notFound("Group not found"));
  router.post("/group", (ctx) => {
    const command = body<UpsertGroupCommand>(ctx);
    const id = nextId(ctx.db, "group");
    const group: Group = {
      id,
      name: command.name,
      isDefault: command.isDefault ?? false,
      isAllGroup: false,
      isolateMembers: command.isolateMembers ?? false,
      status: command.status,
      createdAt: `${ctx.db.today}T12:00:00Z`,
      groupReceiptSettings: { ...ctx.db.groups[0].groupReceiptSettings, id: nextId(ctx.db, "groupSettings"), groupId: id },
      groupMembers: command.groupMembers.map((member) => ({ ...member, groupId: id, categoryGrants: [], tagGrants: [] })),
    };
    ctx.db.groups.push(group);
    return group;
  });
  router.put("/group/:groupId", (ctx) => {
    const group = ctx.db.groups.find((candidate) => candidate.id === idParam(ctx, "groupId"));
    if (!group) {
      return notFound("Group not found");
    }
    const command = body<UpsertGroupCommand>(ctx);
    const previous = new Map(group.groupMembers.map((member) => [member.userId, member]));
    group.name = command.name;
    group.status = command.status;
    group.isolateMembers = command.isolateMembers ?? false;
    group.isDefault = command.isDefault ?? group.isDefault;
    group.groupMembers = command.groupMembers.map((member) => ({
      categoryGrants: [],
      tagGrants: [],
      ...previous.get(member.userId),
      ...member,
      groupId: group.id,
    }));
    return group;
  });
  router.delete("/group/:groupId", (ctx) => {
    const id = idParam(ctx, "groupId");
    if (ctx.db.groups.length <= 1) {
      return badRequest("The demo keeps its one household.");
    }
    ctx.db.groups = ctx.db.groups.filter((group) => group.id !== id);
    const gone = new Set(ctx.db.receipts.filter((receipt) => receipt.groupId === id).map((receipt) => receipt.id));
    ctx.db.receipts = ctx.db.receipts.filter((receipt) => !gone.has(receipt.id));
    ctx.db.products = ctx.db.products.filter((product) => !gone.has(product.receiptId));
    return ok();
  });
  router.put("/group/:groupId/groupReceiptSettings", (ctx) => {
    const group = ctx.db.groups.find((candidate) => candidate.id === idParam(ctx, "groupId"));
    if (!group) {
      return notFound("Group not found");
    }
    group.groupReceiptSettings = { ...group.groupReceiptSettings, ...body<UpdateGroupReceiptSettingsCommand>(ctx) };
    return group.groupReceiptSettings;
  });
  router.put("/group/:groupId/member/:userId/grants", (ctx) => {
    const group = ctx.db.groups.find((candidate) => candidate.id === idParam(ctx, "groupId"));
    const member = group?.groupMembers.find((candidate) => candidate.userId === idParam(ctx, "userId"));
    if (!member) {
      return notFound("Member not found");
    }
    const command = body<UpdateGroupMemberGrantsCommand>(ctx);
    member.categoryGrants = command.categoryGrants ?? [];
    member.tagGrants = command.tagGrants ?? [];
    return member;
  });

  // Users
  router.get("/user", ({ db }) => db.users);
  router.post("/user/getPagedUsers", (ctx) => paginate(ctx.db.users, body<PagedRequest>(ctx), "displayName"));
  router.get("/user/:username", (ctx) => ctx.db.users.filter((user) => sameName(user.username, ctx.params["username"])).length);
  router.post("/user", (ctx) => {
    const sent = body<Partial<UserView> & { password?: string }>(ctx);
    const user: UserView = {
      id: nextId(ctx.db, "user"),
      username: sent.username ?? "",
      displayName: sent.displayName ?? sent.username ?? "",
      defaultAvatarColor: sent.defaultAvatarColor ?? "#6366f1",
      isDummyUser: sent.isDummyUser ?? false,
      appRoleId: sent.appRoleId ?? DEMO_APP_USER_ROLE_ID,
      createdAt: `${ctx.db.today}T12:00:00Z`,
    };
    ctx.db.users.push(user);
    return user;
  });
  router.put("/user/:userId", (ctx) => {
    const user = ctx.db.users.find((candidate) => candidate.id === idParam(ctx, "userId"));
    if (!user) {
      return notFound("User not found");
    }
    const sent = body<Partial<UserView>>(ctx);
    Object.assign(user, {
      displayName: sent.displayName ?? user.displayName,
      defaultAvatarColor: sent.defaultAvatarColor ?? user.defaultAvatarColor,
      appRoleId: sent.appRoleId ?? user.appRoleId,
      isDummyUser: sent.isDummyUser ?? user.isDummyUser,
    });
    return user;
  });
  router.delete("/user/bulk", (ctx) => {
    const ids = new Set(body<{ userIds: string[] }>(ctx).userIds.map(Number));
    if (ids.has(ctx.db.currentUserId)) {
      return badRequest("user cannot delete itself");
    }
    removeUsers(ctx.db, ids);
    return ok();
  });
  router.delete("/user/:userId", (ctx) => {
    const id = idParam(ctx, "userId");
    if (id === ctx.db.currentUserId) {
      return badRequest("user cannot delete itself");
    }
    removeUsers(ctx.db, new Set([id]));
    return ok();
  });
  router.post("/user/:userId/resetPassword", () => ok());
  router.post("/user/:userId/convertDummyUserToNormalUser", (ctx) => {
    const user = ctx.db.users.find((candidate) => candidate.id === idParam(ctx, "userId"));
    if (user) {
      user.isDummyUser = false;
    }
    return ok();
  });

  // Roles (read-only: the family UI offers Admin and User, there is no role editor)
  router.get("/role", ({ db }) => db.roles.map((role) => ({ ...role, categoryGrants: [], tagGrants: [], paidByUserGrants: [] })));
}

function removeUsers(db: DemoDb, ids: Set<number>): void {
  db.users = db.users.filter((user) => !ids.has(user.id));
  db.groups.forEach((group) => {
    group.groupMembers = group.groupMembers.filter((member) => !ids.has(member.userId));
  });
}

