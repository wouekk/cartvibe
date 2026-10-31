import {
  AttachShoppingTripReceiptCommand,
  Receipt,
  ReceiptStatus,
  SetFoodClassificationCommand,
  SetShoppingListCheckedCommand,
  SetShoppingListItemCheckedCommand,
  ShoppingList,
  ShoppingListItem,
  ShoppingTrip,
  ShoppingTripView,
  UpsertShoppingListCommand,
  UpsertShoppingListItemCommand,
} from "../../../open-api";
import { instantOn } from "../dates";
import { DemoDb, nextId } from "../db";
import { DemoContext, body, idParam, notFound, ok } from "../http";
import { DemoRouter } from "../router";
import { formatCents, parseCents } from "../money";
import { addScriptedReceipt } from "../scripted-scan";
import { productsOf } from "./receipts";
import { notify } from "./session";

/**
 * Words the demo's stand-in for the AI knows, so an item typed into a list gets a health tag and a food group the way it
 * would after the classification sweep. Anything else stays untagged, which the app handles (the AI is optional).
 */
const KNOWN_FOODS: { words: string[]; group: string; health: string }[] = [
  { words: ["milk", "yoghurt", "yogurt", "cheese", "butter", "egg", "cream"], group: "Dairy", health: "HEALTHY" },
  { words: ["bread", "roll", "bagel", "croissant", "toast"], group: "Bakery", health: "MEDIUM" },
  { words: ["apple", "banana", "tomato", "lemon", "orange", "carrot", "lettuce", "cucumber", "potato", "onion", "berry", "berries", "pepper", "basil", "salad"], group: "Fresh Produce", health: "HEALTHY" },
  { words: ["chicken", "beef", "pork", "sausage", "ham", "fish", "salmon", "steak"], group: "Meat", health: "MEDIUM" },
  { words: ["water", "juice", "coffee", "tea", "beer", "wine"], group: "Drinks", health: "MEDIUM" },
  { words: ["cola", "lemonade", "soda"], group: "Drinks", health: "UNHEALTHY" },
  { words: ["chocolate", "crisps", "chips", "candy", "gummy", "biscuit", "cookie", "ice cream"], group: "Sweets & Snacks", health: "UNHEALTHY" },
  { words: ["pasta", "spaghetti", "rice", "flour", "sauce", "oil", "sugar", "dough"], group: "Pantry", health: "MEDIUM" },
  { words: ["soap", "detergent", "paper", "plate", "napkin", "sponge", "bin bag"], group: "Household", health: "NOT_FOOD" },
];

function classify(name: string): { health: string; foodGroup: string } {
  const text = name.toLowerCase();
  const known = KNOWN_FOODS.find((food) => food.words.some((word) => text.includes(word)));
  return known ? { health: known.health, foodGroup: known.group } : { health: "", foodGroup: "" };
}

function findList(ctx: DemoContext, param = "listId"): ShoppingList | undefined {
  return ctx.db.lists.find((list) => list.id === idParam(ctx, param));
}

function findItem(db: DemoDb, itemId: number): { list: ShoppingList; item: ShoppingListItem } | undefined {
  for (const list of db.lists) {
    const item = list.items.find((candidate) => candidate.id === itemId);
    if (item) {
      return { list, item };
    }
  }
  return undefined;
}

function applyItemCommand(item: ShoppingListItem, command: UpsertShoppingListItemCommand): void {
  item.name = command.name;
  item.amount = command.amount === undefined || command.amount === "" ? undefined : formatCents(parseCents(command.amount));
  item.unit = command.unit ?? "";
  item.quantity = command.quantity ?? item.quantity;
  item.note = command.note ?? "";
}

function setChecked(db: DemoDb, item: ShoppingListItem, checked: boolean): void {
  item.isChecked = checked;
  item.checkedAt = checked ? instantOn(db.today) : undefined;
  item.checkedByUserId = checked ? db.currentUserId : undefined;
}

const normalise = (text: string): string => text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Compares a receipt's lines with the list: a line is planned when an item's name appears in it (or the other way round). */
function compareTrip(db: DemoDb, list: ShoppingList, receipt: Receipt): ShoppingTripView {
  const products = productsOf(db, receipt.id);
  let planned = 0;
  let unplannedCents = 0;
  const unplannedNames: string[] = [];

  for (const product of products) {
    const name = normalise(product.displayName || product.name);
    const match = list.items.find((item) => {
      const itemName = normalise(item.name);
      return itemName !== "" && (name.includes(itemName) || itemName.includes(name));
    });
    product.planned = match !== undefined;
    product.matchedShoppingListItemId = match?.id;
    if (match) {
      planned++;
    } else {
      unplannedCents += parseCents(product.amount);
      unplannedNames.push(product.displayName || product.name);
    }
  }

  const view: ShoppingTripView = {
    id: nextId(db, "trip"),
    shoppingListId: list.id,
    createdAt: instantOn(db.today),
    status: "DONE",
    lastError: "",
    waitingForPhoto: false,
    receipt: { id: receipt.id, name: receipt.name, date: receipt.date, amount: receipt.amount },
    plannedItemCount: planned,
    productCount: products.length,
    unplannedAmount: formatCents(unplannedCents),
    unplannedProducts: unplannedNames,
  };
  db.trips.push(view);
  return view;
}

const tripRow = (view: ShoppingTripView): ShoppingTrip => ({
  id: view.id,
  shoppingListId: view.shoppingListId,
  receiptId: view.receipt?.id,
  status: view.status,
  lastError: view.lastError,
});

export function registerShopping(router: DemoRouter): void {
  router.get("/shopping-list/group/:groupId", (ctx) => ctx.db.lists.filter((list) => list.groupId === idParam(ctx, "groupId")));
  router.post("/shopping-list/group/:groupId/going-shopping", (ctx) => {
    const groupId = idParam(ctx, "groupId");
    notify(
      ctx.db,
      "Going shopping",
      `\${userId:${ctx.db.currentUserId}.displayName:string} is going shopping. Add what you need to the lists in \${groupId:${groupId}.name:string}.`,
    );
    return ok();
  });
  router.get("/shopping-list/group/:groupId/stream", () => ok(""));
  router.post("/shopping-list/group/:groupId", (ctx) => {
    const list: ShoppingList = {
      id: nextId(ctx.db, "list"),
      groupId: idParam(ctx, "groupId"),
      name: body<UpsertShoppingListCommand>(ctx).name,
      createdAt: instantOn(ctx.db.today),
      createdBy: ctx.db.currentUserId,
      items: [],
    };
    ctx.db.lists.push(list);
    return list;
  });

  router.put("/shopping-list/item/:itemId/classification", (ctx) => {
    const found = findItem(ctx.db, idParam(ctx, "itemId"));
    if (!found) {
      return notFound("Item not found");
    }
    const command = body<SetFoodClassificationCommand>(ctx);
    found.item.health = command.health;
    found.item.seasonality = command.seasonality ?? found.item.seasonality;
    found.item.classificationOverridden = true;
    return found.item;
  });
  router.put("/shopping-list/item/:itemId/checked", (ctx) => {
    const found = findItem(ctx.db, idParam(ctx, "itemId"));
    if (!found) {
      return notFound("Item not found");
    }
    setChecked(ctx.db, found.item, body<SetShoppingListItemCheckedCommand>(ctx).isChecked);
    return found.item;
  });
  router.put("/shopping-list/item/:itemId", (ctx) => {
    const found = findItem(ctx.db, idParam(ctx, "itemId"));
    if (!found) {
      return notFound("Item not found");
    }
    const command = body<UpsertShoppingListItemCommand>(ctx);
    const renamed = command.name !== found.item.name;
    applyItemCommand(found.item, command);
    if (renamed && !found.item.classificationOverridden) {
      Object.assign(found.item, classify(command.name));
    }
    return found.item;
  });
  router.delete("/shopping-list/item/:itemId", (ctx) => {
    const found = findItem(ctx.db, idParam(ctx, "itemId"));
    if (found) {
      found.list.items = found.list.items.filter((item) => item.id !== found.item.id);
    }
    return ok();
  });

  router.delete("/shopping-list/trip/:tripId", (ctx) => {
    ctx.db.trips = ctx.db.trips.filter((trip) => trip.id !== idParam(ctx, "tripId"));
    return ok();
  });
  router.post("/shopping-list/trip/:tripId/retry", () => ok());

  router.post("/shopping-list/:listId/item", (ctx) => {
    const list = findList(ctx);
    if (!list) {
      return notFound("List not found");
    }
    const command = body<UpsertShoppingListItemCommand>(ctx);
    const item: ShoppingListItem = {
      id: nextId(ctx.db, "item"),
      shoppingListId: list.id,
      name: command.name,
      quantity: "1",
      unit: "",
      note: "",
      isChecked: false,
      health: "",
      foodGroup: "",
      seasonality: "NOT_PRODUCE",
      classificationOverridden: false,
      createdAt: instantOn(ctx.db.today),
      createdBy: ctx.db.currentUserId,
    };
    applyItemCommand(item, command);
    Object.assign(item, classify(command.name));
    item.classifiedAt = item.health ? instantOn(ctx.db.today) : undefined;
    list.items.push(item);
    return item;
  });
  router.post("/shopping-list/:listId/clearChecked", (ctx) => {
    const list = findList(ctx);
    if (list) {
      list.items = list.items.filter((item) => !item.isChecked);
    }
    return ok();
  });
  router.put("/shopping-list/:listId/checked", (ctx) => {
    const list = findList(ctx);
    if (!list) {
      return notFound("List not found");
    }
    const command = body<SetShoppingListCheckedCommand>(ctx);
    list.items
      .filter((item) => !command.itemIds || command.itemIds.includes(item.id))
      .forEach((item) => setChecked(ctx.db, item, command.isChecked));
    return list;
  });
  router.get("/shopping-list/:listId/trip", (ctx) => ctx.db.trips.filter((trip) => trip.shoppingListId === idParam(ctx, "listId")));
  router.post("/shopping-list/:listId/trip/upload", (ctx) => {
    // A photo of the receipt is "read" by the script: the fixed sample receipt is attached to the list.
    const list = findList(ctx);
    if (!list) {
      return notFound("List not found");
    }
    const receipt = addScriptedReceipt(ctx.db, list.groupId, ctx.db.currentUserId, ReceiptStatus.Open);
    return tripRow(compareTrip(ctx.db, list, receipt));
  });
  router.post("/shopping-list/:listId/trip", (ctx) => {
    const list = findList(ctx);
    const receipt = ctx.db.receipts.find((candidate) => candidate.id === body<AttachShoppingTripReceiptCommand>(ctx).receiptId);
    if (!list || !receipt) {
      return notFound("List or receipt not found");
    }
    return tripRow(compareTrip(ctx.db, list, receipt));
  });
  router.put("/shopping-list/:listId", (ctx) => {
    const list = findList(ctx);
    if (!list) {
      return notFound("List not found");
    }
    list.name = body<UpsertShoppingListCommand>(ctx).name;
    return list;
  });
  router.delete("/shopping-list/:listId", (ctx) => {
    ctx.db.lists = ctx.db.lists.filter((list) => list.id !== idParam(ctx, "listId"));
    ctx.db.trips = ctx.db.trips.filter((trip) => trip.shoppingListId !== idParam(ctx, "listId"));
    return ok();
  });
}
