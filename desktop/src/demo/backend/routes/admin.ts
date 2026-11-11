import {
  AiModel,
  AiUsageMonth,
  BackupSummary,
  CurrencyRateTable,
  ReceiptProcessingSettings,
  SystemSettings,
  UpsertReceiptProcessingSettingsCommand,
  UpsertSystemSettingsCommand,
} from "../../../open-api";
import { instantOn } from "../dates";
import { DemoContext, badRequest, body, idParam, notFound, ok } from "../http";
import { nextId } from "../db";
import { PagedRequest, paginate } from "../paging";
import { DemoRouter } from "../router";
import { receiptImageDataUrl } from "../receipt-image";
import { productsOf } from "./receipts";

const NOT_IN_DEMO = "This is switched off in the demo.";

/** Never echo a stored secret: the real API only reports whether one is set. */
function publicSettings(settings: ReceiptProcessingSettings): ReceiptProcessingSettings {
  return { ...settings, key: undefined };
}

export function registerAdmin(router: DemoRouter): void {
  // System settings
  router.get("/systemSettings/logs", () => [
    { timestamp: "2026-01-01T00:00:00Z", level: "info", message: "The demo has no server log: this page shows a sample line." },
  ]);
  router.get("/systemSettings", ({ db }) => db.settings);
  router.put("/systemSettings", (ctx) => {
    const command = body<UpsertSystemSettingsCommand>(ctx);
    // A typed Logo.dev key is never stored (the demo keeps no secret); everything else is kept in memory.
    const { shopLogoKey, ...rest } = command;
    void shopLogoKey;
    const next: SystemSettings = { ...ctx.db.settings, ...rest, updatedAt: instantOn(ctx.db.today) };
    ctx.db.settings = next;
    return next;
  });
  // Household export: the summary answers from the demo's data; the download itself is switched off (the
  // page says so instead of navigating to a server the demo does not have).
  router.get("/backup/summary", ({ db }): BackupSummary => ({
    counts: [
      { name: "users", count: db.users.length },
      { name: "groups", count: db.groups.length },
      { name: "categories", count: db.categories.length },
      { name: "tags", count: db.tags.length },
      { name: "receipts", count: db.receipts.length },
      { name: "receipt_products", count: db.products.length },
      { name: "shopping_lists", count: db.lists.length },
      { name: "shopping_list_items", count: db.lists.reduce((sum, list) => sum + (list.items?.length ?? 0), 0) },
      { name: "report_templates", count: db.reportTemplates.length },
    ],
    fileCount: db.receipts.reduce((sum, receipt) => sum + (receipt.imageFiles?.length ?? 0), 0),
    fileBytes: 0,
    formatVersion: 1,
  }));
  router.get("/backup/export", () => badRequest(NOT_IN_DEMO));
  router.get("/backup/import", () => []);
  router.post("/backup/import", () => badRequest(NOT_IN_DEMO));
  router.get("/exchangeRate", ({ db }): CurrencyRateTable => ({ mainCurrency: "EUR", rates: db.exchangeRates }));
  router.put("/exchangeRate", (ctx) => {
    const table = body<CurrencyRateTable>(ctx);
    ctx.db.exchangeRates = table.rates.map((rate) => ({ code: rate.code, rate: rate.rate ?? "" }));
    return { mainCurrency: "EUR", rates: ctx.db.exchangeRates };
  });

  // Activity and system tasks
  router.post("/systemTask/getPagedSystemTasks", (ctx) => paginate(ctx.db.systemTasks, body<PagedRequest>(ctx), "startedAt"));
  router.post("/systemTask/getPagedActivities", (ctx) => paginate(ctx.db.systemTasks, body<PagedRequest>(ctx), "startedAt"));
  router.post("/systemTask/rerunActivity/:id", () => badRequest("Reading again is scripted in the demo: use Read again on a receipt."));
  router.get("/systemTask/:id/sourceFile/download", (ctx) => sourceFile(ctx, true));
  router.get("/systemTask/:id/sourceFile", (ctx) => sourceFile(ctx, false));

  // AI settings: one scripted reader, never a call to a model
  router.post("/receiptProcessingSettings/getPagedProcessingSettings", (ctx) =>
    paginate(ctx.db.processingSettings.map(publicSettings), body<PagedRequest>(ctx), "name"),
  );
  router.post("/receiptProcessingSettings/checkConnectivity", (ctx) => ({
    id: nextId(ctx.db, "task"),
    createdAt: instantOn(ctx.db.today),
    type: "RECEIPT_PROCESSING_SETTINGS_CONNECTIVITY_CHECK",
    status: "SUCCEEDED",
    startedAt: instantOn(ctx.db.today),
    endedAt: instantOn(ctx.db.today),
    resultDescription: "The demo does not contact any AI provider; this check is scripted.",
  }));
  router.post("/receiptProcessingSettings/aiModels", (): AiModel[] => [{ name: "demo", displayName: "Demo (scripted)" }]);
  // What the scripted reads of the sample receipts would have cost, so the usage card has something to show.
  router.get("/receiptProcessingSettings/usage", (ctx): AiUsageMonth[] => [
    { month: ctx.db.today.slice(0, 7), aiType: "GEMINI", model: "demo", calls: 4, inputTokens: 6120, outputTokens: 1480 },
  ]);
  router.post("/receiptProcessingSettings", (ctx) => {
    const command = body<UpsertReceiptProcessingSettingsCommand>(ctx);
    const settings: ReceiptProcessingSettings = { ...command, id: nextId(ctx.db, "processing"), createdAt: instantOn(ctx.db.today), key: undefined };
    ctx.db.processingSettings.push(settings);
    return publicSettings(settings);
  });
  router.get("/receiptProcessingSettings/:id", (ctx) => {
    const settings = ctx.db.processingSettings.find((candidate) => candidate.id === idParam(ctx, "id"));
    return settings ? publicSettings(settings) : notFound("Settings not found");
  });
  router.put("/receiptProcessingSettings/:id", (ctx) => {
    const settings = ctx.db.processingSettings.find((candidate) => candidate.id === idParam(ctx, "id"));
    if (!settings) {
      return notFound("Settings not found");
    }
    // The key is dropped on purpose: the demo stores no secret, even one typed into the form.
    const { key, ...rest } = body<UpsertReceiptProcessingSettingsCommand>(ctx);
    void key;
    Object.assign(settings, rest, { updatedAt: instantOn(ctx.db.today) });
    return publicSettings(settings);
  });
  router.delete("/receiptProcessingSettings/:id", (ctx) => {
    ctx.db.processingSettings = ctx.db.processingSettings.filter((settings) => settings.id !== idParam(ctx, "id"));
    return ok();
  });

  // Sign-in providers and shop logos are not part of the demo
  router.post("/oidcProvider/getPagedOidcProviders", () => ({ data: [], totalCount: 0 }));
  router.post("/oidcProvider", () => badRequest(NOT_IN_DEMO));
  router.get("/oidcProvider/:id", () => notFound("Provider not found"));
  router.put("/oidcProvider/:id", () => badRequest(NOT_IN_DEMO));
  router.delete("/oidcProvider/:id", () => ok());
  router.get("/oidc/connections", () => []);
  router.delete("/oidc/connections/:name", () => notFound("Not connected"));
  router.get("/shopLogo/status", () => ({ running: false, downloaded: 0, total: 0, lastError: "" }));
  router.post("/shopLogo/sync", () => badRequest(NOT_IN_DEMO));
  router.delete("/shopLogo", () => ({ running: false, downloaded: 0, total: 0, lastError: "" }));
  router.get("/shopLogo/:slug", () => notFound("No logo"));
  router.get("/shopLogo", () => []);
}

function sourceFile(ctx: DemoContext, download: boolean) {
  const task = ctx.db.systemTasks.find((candidate) => candidate.id === idParam(ctx, "id"));
  const receipt = ctx.db.receipts.find((candidate) => candidate.id === task?.receiptId);
  if (!task || !receipt) {
    return notFound("No source file");
  }

  const url = receiptImageDataUrl(receipt, productsOf(ctx.db, receipt.id));
  return download
    ? { status: 200, file: { content: decodeURIComponent(url.slice(url.indexOf(",") + 1)), type: "image/svg+xml" } }
    : { name: "scan.svg", encodedImage: url };
}
