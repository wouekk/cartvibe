import {
  ReceiptProduct,
  ReceiptProductsView,
  SetFoodClassificationCommand,
  SetReceiptProductLabelsCommand,
  UpsertReceiptProductCommand,
} from "../../../open-api";
import { instantOn } from "../dates";
import { DemoDb, nextId } from "../db";
import { DemoContext, body, idParam, notFound, ok } from "../http";
import { DemoRouter } from "../router";
import { formatCents, parseCents } from "../money";
import { SCRIPTED_SCAN } from "../scripted-scan";
import { productsOf } from "./receipts";

function view(db: DemoDb, receiptId: number): ReceiptProductsView {
  return { status: "DONE", lastError: "", products: productsOf(db, receiptId) };
}

function findProduct(ctx: DemoContext): ReceiptProduct | undefined {
  return ctx.db.products.find((product) => product.id === idParam(ctx, "productId"));
}

function resolveCategory(db: DemoDb, categoryId: number | undefined): { categoryId?: number; foodGroup: string } {
  const category = db.categories.find((candidate) => candidate.id === categoryId);
  return category ? { categoryId: category.id, foodGroup: category.name ?? "" } : { categoryId: undefined, foodGroup: "" };
}

/** The scripted reading, scaled so its lines add up to the receipt's total (whole cents; the last line takes the rest). */
function readAgain(db: DemoDb, receiptId: number): void {
  const receipt = db.receipts.find((candidate) => candidate.id === receiptId);
  if (!receipt) {
    return;
  }

  const scripted = SCRIPTED_SCAN.lines;
  const weights = scripted.map((entry) => parseCents(entry.amount));
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const total = parseCents(receipt.amount);

  let assigned = 0;
  db.products = db.products.filter((product) => product.receiptId !== receiptId);
  scripted.forEach((entry, index) => {
    const share = index === scripted.length - 1 ? total - assigned : Math.floor((total * weights[index]) / weightTotal);
    assigned += share;
    db.products.push({
      id: nextId(db, "product"),
      receiptId,
      createdAt: instantOn(db.today),
      updatedAt: instantOn(db.today),
      name: entry.name.toUpperCase(),
      displayName: entry.name,
      amount: formatCents(share),
      quantity: entry.quantity,
      position: index + 1,
      health: entry.health,
      foodGroup: entry.category,
      seasonality: "NOT_PRODUCE",
      classifiedAt: instantOn(db.today),
      classificationOverridden: false,
      categoryId: db.categories.find((category) => category.name === entry.category)?.id,
      categoryOverridden: false,
      tags: [],
    });
  });
}

export function registerProducts(router: DemoRouter): void {
  router.get("/receipt-product/receipt/:receiptId", (ctx) => view(ctx.db, idParam(ctx, "receiptId")));
  router.post("/receipt-product/receipt/:receiptId/read", (ctx) => {
    readAgain(ctx.db, idParam(ctx, "receiptId"));
    return view(ctx.db, idParam(ctx, "receiptId"));
  });
  router.post("/receipt-product/group/:groupId/backfill", () => ({ queued: 0 }));

  router.post("/receipt-product/receipt/:receiptId/product", (ctx) => {
    const receiptId = idParam(ctx, "receiptId");
    const command = body<UpsertReceiptProductCommand>(ctx);
    const product: ReceiptProduct = {
      id: nextId(ctx.db, "product"),
      receiptId,
      createdAt: instantOn(ctx.db.today),
      name: command.name,
      displayName: command.name,
      amount: command.amount === undefined || command.amount === "" ? undefined : formatCents(parseCents(command.amount)),
      quantity: command.quantity || "1",
      position: productsOf(ctx.db, receiptId).length + 1,
      health: "",
      seasonality: "",
      classificationOverridden: false,
      categoryOverridden: command.categoryId !== undefined,
      tags: ctx.db.tags.filter((tag) => command.tagIds?.includes(tag.id ?? -1)),
      ...resolveCategory(ctx.db, command.categoryId),
    };
    ctx.db.products.push(product);
    return product;
  });
  router.put("/receipt-product/product/:productId/classification", (ctx) => {
    const product = findProduct(ctx);
    if (!product) {
      return notFound("Product not found");
    }
    const command = body<SetFoodClassificationCommand>(ctx);
    product.health = command.health;
    product.seasonality = command.seasonality ?? product.seasonality;
    product.classificationOverridden = true;
    return product;
  });
  router.put("/receipt-product/product/:productId/labels", (ctx) => {
    const product = findProduct(ctx);
    if (!product) {
      return notFound("Product not found");
    }
    const command = body<SetReceiptProductLabelsCommand>(ctx);
    Object.assign(product, resolveCategory(ctx.db, command.categoryId), {
      categoryOverridden: true,
      tags: ctx.db.tags.filter((tag) => command.tagIds.includes(tag.id ?? -1)),
    });
    return product;
  });
  router.put("/receipt-product/product/:productId", (ctx) => {
    const product = findProduct(ctx);
    if (!product) {
      return notFound("Product not found");
    }
    const command = body<UpsertReceiptProductCommand>(ctx);
    product.name = command.name;
    product.displayName = command.name;
    if (command.amount !== undefined) {
      product.amount = command.amount === "" ? undefined : formatCents(parseCents(command.amount));
    }
    product.quantity = command.quantity || product.quantity;
    if (command.categoryId !== undefined) {
      Object.assign(product, resolveCategory(ctx.db, command.categoryId), { categoryOverridden: true });
    }
    if (command.tagIds) {
      product.tags = ctx.db.tags.filter((tag) => command.tagIds?.includes(tag.id ?? -1));
    }
    return product;
  });
  router.delete("/receipt-product/product/:productId", (ctx) => {
    ctx.db.products = ctx.db.products.filter((product) => product.id !== idParam(ctx, "productId"));
    return ok();
  });
}
