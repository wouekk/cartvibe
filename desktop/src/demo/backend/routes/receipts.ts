import {
  BulkStatusUpdateCommand,
  Category,
  Comment,
  FileData,
  FileDataView,
  Receipt,
  ReceiptPagedRequestCommand,
  ReceiptProduct,
  ReceiptStatus,
  SearchResult,
  Tag,
  UpsertCategoryCommand,
  UpsertCommentCommand,
  UpsertReceiptCommand,
  UpsertTagCommand,
} from "../../../open-api";
import { csv, zipStore } from "../files";
import { dayToWire, instantOn, monthKey } from "../dates";
import { DemoDb, nextId } from "../db";
import { DemoContext, DemoResponse, badRequest, body, idParam, notFound, ok } from "../http";
import { paginate } from "../paging";
import { DemoRouter } from "../router";
import { formatCents, parseCents } from "../money";
import { receiptImageDataUrl } from "../receipt-image";
import { addScriptedReceipt, scriptedProducts, scriptedReceiptDraft } from "../scripted-scan";
import { notify } from "./session";

type FilterField = { operation?: string; value?: unknown } | undefined;

/** The multipart bodies reach the backend decoded into `field -> values`; file parts are `{ name, type, size }`. */
export type FormFields = Record<string, unknown[]>;

export function formValues(ctx: DemoContext, field: string): unknown[] {
  return (ctx.req.body as FormFields | undefined)?.[field] ?? [];
}

const dayOf = (value: unknown): string => String(value ?? "").slice(0, 10);

function matchesDay(actual: string | undefined, field: FilterField, today: string): boolean {
  if (!field?.operation || field.value === undefined || field.value === null || field.value === "") {
    return field?.operation !== "WITHIN_CURRENT_MONTH" || monthKey(dayOf(actual)) === monthKey(today);
  }

  const day = dayOf(actual);
  if (!day) {
    return false;
  }

  switch (field.operation) {
    case "BETWEEN": {
      const bounds = field.value as unknown[];
      return bounds.length === 2 ? day >= dayOf(bounds[0]) && day <= dayOf(bounds[1]) : true;
    }
    case "EQUALS":
      return day === dayOf(field.value);
    case "GREATER_THAN":
      return day > dayOf(field.value);
    case "LESS_THAN":
      return day < dayOf(field.value);
    default:
      return true;
  }
}

function matchesAmount(amount: string, field: FilterField): boolean {
  if (!field?.operation || field.value === undefined || field.value === null) {
    return true;
  }

  const cents = parseCents(amount);
  switch (field.operation) {
    case "BETWEEN": {
      const bounds = field.value as unknown[];
      return bounds.length === 2 ? cents >= parseCents(String(bounds[0])) && cents <= parseCents(String(bounds[1])) : true;
    }
    case "EQUALS":
      return cents === parseCents(String(field.value));
    case "GREATER_THAN":
      return cents > parseCents(String(field.value));
    case "LESS_THAN":
      return cents < parseCents(String(field.value));
    default:
      return true;
  }
}

const idsOf = (field: FilterField): number[] | undefined =>
  Array.isArray(field?.value) && (field?.value as unknown[]).length > 0 ? (field?.value as unknown[]).map(Number) : undefined;

export function productsOf(db: DemoDb, receiptId: number): ReceiptProduct[] {
  return db.products.filter((product) => product.receiptId === receiptId).sort((a, b) => a.position - b.position);
}

function searchMatches(db: DemoDb, receipt: Receipt, term: string): ReceiptProduct[] {
  const needle = term.toLowerCase();
  return productsOf(db, receipt.id).filter((product) => `${product.name} ${product.displayName}`.toLowerCase().includes(needle));
}

/** The receipts of a group that pass a receipts-table filter, with the same rules the API applies. */
export function filterReceipts(db: DemoDb, groupId: number | undefined, filter: ReceiptPagedRequestCommand["filter"]): Receipt[] {
  const f = (filter ?? {}) as Record<string, FilterField> & { search?: string; warrantyActive?: boolean; warrantyEndsBy?: string };
  const paidBy = idsOf(f["paidBy"]);
  const statuses = Array.isArray(f["status"]?.value) ? (f["status"]?.value as string[]).map(String) : undefined;
  const categories = idsOf(f["categories"]);
  const tags = idsOf(f["tags"]);
  const groups = idsOf(f["group"]);
  const nameTerm = typeof f["name"]?.value === "string" ? (f["name"]?.value as string).toLowerCase() : "";
  const search = (f.search ?? "").trim().toLowerCase();

  return db.receipts.filter((receipt) => {
    if (groupId !== undefined && receipt.groupId !== groupId) {
      return false;
    }
    if (groups && !groups.includes(receipt.groupId)) {
      return false;
    }
    if (nameTerm && !receipt.name.toLowerCase().includes(nameTerm)) {
      return false;
    }
    if (paidBy && !paidBy.includes(receipt.paidByUserId)) {
      return false;
    }
    if (statuses && statuses.length > 0 && !statuses.includes(receipt.status)) {
      return false;
    }
    if (!matchesDay(receipt.date, f["date"], db.today)) {
      return false;
    }
    if (!matchesDay(receipt.resolvedDate, f["resolvedDate"], db.today)) {
      return false;
    }
    if (!matchesDay(receipt.createdAt, f["createdAt"], db.today)) {
      return false;
    }
    if (!matchesAmount(receipt.amount, f["amount"])) {
      return false;
    }

    const products = productsOf(db, receipt.id);
    if (categories && !products.some((product) => product.categoryId !== undefined && categories.includes(product.categoryId))) {
      return false;
    }
    if (tags && !products.some((product) => product.tags.some((tag) => tags.includes(tag.id ?? -1))) && !receipt.tags.some((tag) => tags.includes(tag.id ?? -1))) {
      return false;
    }
    if (f.warrantyActive && !(receipt.warrantyUntil && dayOf(receipt.warrantyUntil) >= db.today)) {
      return false;
    }
    if (f.warrantyEndsBy && !(receipt.warrantyUntil && dayOf(receipt.warrantyUntil) <= f.warrantyEndsBy)) {
      return false;
    }
    if (search) {
      const inReceipt = `${receipt.name} ${receipt.shopName ?? ""}`.toLowerCase().includes(search);
      if (!inReceipt && searchMatches(db, receipt, search).length === 0) {
        return false;
      }
    }
    return true;
  });
}

function withSearchMatches(db: DemoDb, receipts: Receipt[], term: string | undefined): Receipt[] {
  const search = (term ?? "").trim();
  if (!search) {
    return receipts;
  }
  return receipts.map((receipt) => ({
    ...receipt,
    searchMatches: searchMatches(db, receipt, search)
      .slice(0, 5)
      .map((product) => ({ name: product.displayName || product.name, amount: product.amount })),
  }));
}

function resolveCategories(db: DemoDb, sent: UpsertCategoryCommand[] | undefined): Category[] {
  return (sent ?? [])
    .map((entry) => db.categories.find((category) => category.id === entry.id) ?? db.categories.find((category) => category.name === entry.name))
    .filter((category): category is Category => !!category);
}

function resolveTags(db: DemoDb, sent: UpsertTagCommand[] | undefined): Tag[] {
  return (sent ?? [])
    .map((entry) => db.tags.find((tag) => tag.id === entry.id) ?? db.tags.find((tag) => tag.name === entry.name))
    .filter((tag): tag is Tag => !!tag);
}

function addComments(db: DemoDb, receipt: Receipt, comments: UpsertCommentCommand[] | undefined): void {
  for (const entry of comments ?? []) {
    receipt.comments.push(makeComment(db, receipt.id, entry.comment, entry.userId));
  }
  receipt.firstComment = receipt.comments[0]?.comment;
}

function makeComment(db: DemoDb, receiptId: number, text: string, userId?: number): Comment {
  return { id: nextId(db, "comment"), receiptId, userId: userId ?? db.currentUserId, comment: text, createdAt: instantOn(db.today) };
}

function applyCommand(db: DemoDb, receipt: Receipt, command: UpsertReceiptCommand): void {
  receipt.name = command.name;
  receipt.shopName = command.shopName ?? receipt.shopName;
  receipt.amount = formatCents(parseCents(command.amount));
  receipt.date = dayToWire(command.date.slice(0, 10));
  receipt.groupId = command.groupId;
  receipt.paidByUserId = command.paidByUserId;
  setStatus(db, receipt, command.status);
  receipt.categories = resolveCategories(db, command.categories);
  receipt.tags = resolveTags(db, command.tags);
  receipt.updatedAt = instantOn(db.today);
}

function setStatus(db: DemoDb, receipt: Receipt, status: ReceiptStatus): void {
  receipt.status = status;
  receipt.resolvedDate = status === ReceiptStatus.Resolved ? (receipt.resolvedDate ?? instantOn(db.today)) : undefined;
}

function newReceipt(db: DemoDb, command: UpsertReceiptCommand): Receipt {
  const receipt: Receipt = {
    id: nextId(db, "receipt"),
    name: command.name,
    amount: "0.00",
    date: dayToWire(db.today),
    groupId: command.groupId,
    paidByUserId: command.paidByUserId,
    status: command.status,
    categories: [],
    tags: [],
    comments: [],
    imageFiles: [],
    createdAt: instantOn(db.today),
    createdBy: db.currentUserId,
  };
  applyCommand(db, receipt, command);
  addComments(db, receipt, command.comments);
  db.receipts.push(receipt);
  return receipt;
}

function fileCount(descriptors: unknown[]): number {
  return descriptors.length;
}

function attachImages(db: DemoDb, receipt: Receipt, count: number): void {
  for (let index = 0; index < count; index++) {
    const file: FileData = {
      id: nextId(db, "file"),
      receiptId: receipt.id,
      name: `photo-${index + 1}.svg`,
      fileType: "image/svg+xml",
      size: 2048,
      createdAt: instantOn(db.today),
    };
    receipt.imageFiles = [...(receipt.imageFiles ?? []), file];
  }
}

function findReceipt(ctx: DemoContext, param = "receiptId"): Receipt | undefined {
  return ctx.db.receipts.find((receipt) => receipt.id === idParam(ctx, param));
}

function removeReceipts(db: DemoDb, ids: Set<number>): void {
  db.receipts = db.receipts.filter((receipt) => !ids.has(receipt.id));
  db.products = db.products.filter((product) => !ids.has(product.receiptId));
  db.trips = db.trips.filter((trip) => trip.receipt === undefined || !ids.has(trip.receipt.id));
}

function findImage(db: DemoDb, imageId: number): { receipt: Receipt; file: FileData } | undefined {
  for (const receipt of db.receipts) {
    const file = receipt.imageFiles?.find((candidate) => candidate.id === imageId);
    if (file) {
      return { receipt, file };
    }
  }
  return undefined;
}

function imageView(db: DemoDb, receipt: Receipt, file: FileData): FileDataView {
  return {
    id: file.id,
    createdAt: file.createdAt ?? instantOn(db.today),
    name: file.name ?? "receipt.svg",
    encodedImage: receiptImageDataUrl(receipt, productsOf(db, receipt.id)),
  };
}

/** The export: one CSV of receipts and one of their product lines, zipped, since that is what the app saves it as. */
function exportZip(db: DemoDb, receipts: Receipt[]): DemoResponse {
  const names = new Map(db.users.map((user) => [user.id, user.displayName]));
  const receiptRows = [
    ["Id", "Name", "Shop", "Date", "Amount", "Status", "Paid by"],
    ...receipts.map((receipt) => [
      String(receipt.id),
      receipt.name,
      receipt.shopName ?? "",
      receipt.date.slice(0, 10),
      receipt.amount,
      receipt.status,
      names.get(receipt.paidByUserId) ?? "",
    ]),
  ];
  const ids = new Set(receipts.map((receipt) => receipt.id));
  const productRows = [
    ["Receipt id", "Product", "Amount", "Quantity", "Category", "Health"],
    ...db.products
      .filter((product) => ids.has(product.receiptId))
      .map((product) => [String(product.receiptId), product.displayName, product.amount ?? "", product.quantity, product.foodGroup, product.health]),
  ];

  return {
    status: 200,
    file: { content: zipStore([{ name: "receipts.csv", content: csv(receiptRows) }, { name: "products.csv", content: csv(productRows) }]), type: "application/zip" },
  };
}

export function registerReceipts(router: DemoRouter): void {
  router.post("/receipt/group/:groupId", (ctx) => {
    const request = body<ReceiptPagedRequestCommand>(ctx);
    const receipts = filterReceipts(ctx.db, idParam(ctx, "groupId"), request.filter);
    // The Shop column sorts by the shop, else the name (as the API does), without changing what is sent back.
    const byId = new Map(receipts.map((receipt) => [receipt.id, receipt]));
    const page = paginate(receipts.map((receipt) => ({ ...receipt, shopName: receipt.shopName || receipt.name })), request, "date");
    const data = page.data.map((receipt) => byId.get(receipt.id) as Receipt);
    return { data: withSearchMatches(ctx.db, data, request.filter?.search), totalCount: page.totalCount };
  });
  router.get("/receipt/hasAccess", (ctx) => {
    const id = Number(ctx.req.query.get("receiptId"));
    return ctx.db.receipts.some((receipt) => receipt.id === id) ? ok(true) : notFound("Receipt not found");
  });
  router.post("/receipt/bulkStatusUpdate", (ctx) => {
    const command = body<BulkStatusUpdateCommand>(ctx);
    for (const receipt of ctx.db.receipts.filter((candidate) => command.receiptIds.includes(candidate.id))) {
      setStatus(ctx.db, receipt, command.status as ReceiptStatus);
      if (command.comment) {
        receipt.comments.push(makeComment(ctx.db, receipt.id, command.comment));
        receipt.firstComment = receipt.comments[0]?.comment;
      }
    }
    return ok();
  });
  router.post("/receipt/quickScan", (ctx) => {
    const files = formValues(ctx, "files");
    const groupIds = formValues(ctx, "groupIds");
    const paidBy = formValues(ctx, "paidByUserIds");
    const statuses = formValues(ctx, "statuses");
    for (let index = 0; index < Math.max(files.length, 1); index++) {
      const receipt = addScriptedReceipt(
        ctx.db,
        Number(groupIds[index] ?? groupIds[0] ?? ctx.db.groups[0].id),
        Number(paidBy[index] ?? paidBy[0] ?? ctx.db.currentUserId),
        (String(statuses[index] ?? statuses[0] ?? "") || ReceiptStatus.Open) as ReceiptStatus,
      );
      notify(ctx.db, "Receipt ready", `The receipt: ${receipt.name} has been read by the AI. Check it out! \${receiptId:${receipt.id}.:link}`);
    }
    return ok();
  });
  router.post("/receipt/withFiles", (ctx) => {
    const command = formValues(ctx, "receipt")[0] as UpsertReceiptCommand | undefined;
    if (!command || typeof command !== "object") {
      return badRequest("A receipt is required.");
    }
    const receipt = newReceipt(ctx.db, command);
    attachImages(ctx.db, receipt, fileCount(formValues(ctx, "files")));
    return receipt;
  });
  router.post("/receipt", (ctx) => newReceipt(ctx.db, body<UpsertReceiptCommand>(ctx)));
  router.post("/receipt/:receiptId/duplicate", (ctx) => {
    const original = findReceipt(ctx);
    if (!original) {
      return notFound("Receipt not found");
    }
    const copy: Receipt = {
      ...JSON.parse(JSON.stringify(original)),
      id: nextId(ctx.db, "receipt"),
      status: ReceiptStatus.Open,
      resolvedDate: undefined,
      comments: [],
      firstComment: undefined,
      imageFiles: [],
      createdAt: instantOn(ctx.db.today),
      createdBy: ctx.db.currentUserId,
    };
    ctx.db.receipts.push(copy);
    for (const product of productsOf(ctx.db, original.id)) {
      ctx.db.products.push({ ...JSON.parse(JSON.stringify(product)), id: nextId(ctx.db, "product"), receiptId: copy.id, planned: undefined });
    }
    return copy;
  });
  router.put("/receipt/:receiptId/name", (ctx) => {
    const receipt = findReceipt(ctx);
    if (!receipt) {
      return notFound("Receipt not found");
    }
    receipt.name = body<{ name: string }>(ctx).name;
    return receipt;
  });
  router.put("/receipt/:receiptId/amount", (ctx) => {
    const receipt = findReceipt(ctx);
    if (!receipt) {
      return notFound("Receipt not found");
    }
    receipt.amount = formatCents(parseCents(body<{ amount: string }>(ctx).amount));
    return receipt;
  });
  router.put("/receipt/:receiptId/date", (ctx) => {
    const receipt = findReceipt(ctx);
    if (!receipt) {
      return notFound("Receipt not found");
    }
    receipt.date = dayToWire(body<{ date: string }>(ctx).date.slice(0, 10));
    return receipt;
  });
  router.put("/receipt/:receiptId/warranty", (ctx) => {
    const receipt = findReceipt(ctx);
    if (!receipt) {
      return notFound("Receipt not found");
    }
    const until = body<{ warrantyUntil?: string }>(ctx).warrantyUntil;
    receipt.warrantyUntil = until ? until.slice(0, 10) : undefined;
    return receipt;
  });
  router.get("/receipt/:receiptId", (ctx) => findReceipt(ctx) ?? notFound("Receipt not found"));
  router.put("/receipt/:receiptId", (ctx) => {
    const receipt = findReceipt(ctx);
    if (!receipt) {
      return notFound("Receipt not found");
    }
    // A receipt update does not persist comments (they have their own endpoints), as on the real API.
    applyCommand(ctx.db, receipt, body<UpsertReceiptCommand>(ctx));
    return receipt;
  });
  router.delete("/receipt/:receiptId", (ctx) => {
    removeReceipts(ctx.db, new Set([idParam(ctx, "receiptId")]));
    return ok();
  });

  // Comments
  router.post("/comment", (ctx) => {
    const command = body<UpsertCommentCommand>(ctx);
    const receipt = ctx.db.receipts.find((candidate) => candidate.id === command.receiptId);
    if (!receipt) {
      return notFound("Receipt not found");
    }
    const comment = makeComment(ctx.db, receipt.id, command.comment, command.userId);
    receipt.comments.push(comment);
    receipt.firstComment = receipt.comments[0]?.comment;
    return comment;
  });
  router.delete("/comment/:commentId", (ctx) => {
    for (const receipt of ctx.db.receipts) {
      receipt.comments = receipt.comments.filter((comment) => comment.id !== idParam(ctx, "commentId"));
      receipt.firstComment = receipt.comments[0]?.comment;
    }
    return ok();
  });

  // Images: drawn from the receipt's own data, never stored from an upload.
  router.post("/receiptImage/convertToJpg", ({ db }) => ({
    encodedImage: receiptImageDataUrl(scriptedReceiptDraft(db, db.currentUserId), scriptedProducts(db, 0)),
  }));
  router.post("/receiptImage/magicFill", ({ db }) => scriptedReceiptDraft(db, db.currentUserId));
  router.post("/receiptImage", (ctx) => {
    const receipt = ctx.db.receipts.find((candidate) => candidate.id === Number(formValues(ctx, "receiptId")[0]));
    if (!receipt) {
      return notFound("Receipt not found");
    }
    attachImages(ctx.db, receipt, 1);
    const file = receipt.imageFiles?.[receipt.imageFiles.length - 1] as FileData;
    return imageView(ctx.db, receipt, file);
  });
  router.get("/receiptImage/:imageId/download", (ctx) => {
    const found = findImage(ctx.db, idParam(ctx, "imageId"));
    if (!found) {
      return notFound("Image not found");
    }
    const url = receiptImageDataUrl(found.receipt, productsOf(ctx.db, found.receipt.id));
    return { status: 200, file: { content: decodeURIComponent(url.slice(url.indexOf(",") + 1)), type: "image/svg+xml" } };
  });
  router.get("/receiptImage/:imageId", (ctx) => {
    const found = findImage(ctx.db, idParam(ctx, "imageId"));
    return found ? imageView(ctx.db, found.receipt, found.file) : notFound("Image not found");
  });
  router.delete("/receiptImage/:imageId", (ctx) => {
    const found = findImage(ctx.db, idParam(ctx, "imageId"));
    if (found) {
      found.receipt.imageFiles = found.receipt.imageFiles?.filter((file) => file.id !== found.file.id);
    }
    return ok();
  });

  // Search box and exports
  router.get("/search", (ctx) => {
    const term = (ctx.req.query.get("searchTerm") ?? "").trim().toLowerCase();
    if (!term) {
      return [];
    }
    return ctx.db.receipts
      .filter((receipt) => `${receipt.name} ${receipt.shopName ?? ""}`.toLowerCase().includes(term))
      .slice(0, 10)
      .map(
        (receipt): SearchResult => ({
          id: receipt.id,
          name: receipt.name,
          type: "receipt",
          groupId: receipt.groupId,
          date: receipt.date,
          amount: receipt.amount,
          receiptStatus: receipt.status,
          paidByUserId: receipt.paidByUserId,
          createdAt: receipt.createdAt ?? receipt.date,
        }),
      );
  });
  router.post("/export/:groupId", (ctx) => {
    const request = body<ReceiptPagedRequestCommand>(ctx);
    const groupId = Number(ctx.params["groupId"]);
    return exportZip(ctx.db, filterReceipts(ctx.db, Number.isFinite(groupId) ? groupId : undefined, request.filter));
  });
  router.post("/export", (ctx) => {
    const ids = new Set(ctx.req.query.getAll("receiptIds").flatMap((value) => value.split(",")).map(Number));
    return exportZip(ctx.db, ctx.db.receipts.filter((receipt) => ids.has(receipt.id)));
  });
}
