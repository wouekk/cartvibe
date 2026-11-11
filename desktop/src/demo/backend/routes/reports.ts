import { ReportRequestCommand, ReportTemplate } from "../../../open-api";
import { csv, pdf, xlsx, zipStore } from "../files";
import { DemoDb, nextId } from "../db";
import { DemoContext, DemoResponse, body, idParam, notFound, ok } from "../http";
import { PagedRequest, paginate } from "../paging";
import { DemoRouter } from "../router";
import { ReportTable, reportHtml, reportReceipts, runReport } from "../report-engine";
import { instantOn } from "../dates";

const ALL_ACTIONS = ["read", "update", "delete", "duplicate", "generate"];

function findTemplate(ctx: DemoContext): ReportTemplate | undefined {
  return ctx.db.reportTemplates.find((template) => template.id === idParam(ctx, "id"));
}

function fileFor(format: string, table: ReportTable): { name: string; content: string | Uint8Array<ArrayBuffer>; type: string } {
  const sheet = [table.header, ...table.rows];
  switch (format) {
    case "xlsx":
      return { name: "report.xlsx", content: xlsx(sheet), type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
    case "pdf":
      return {
        name: "report.pdf",
        content: pdf(table.title, [table.intro, "", table.header.join("  |  "), ...table.rows.map((row) => row.join("  |  ")), "", table.footer].filter((text, index) => index > 1 || text !== "")),
        type: "application/pdf",
      };
    default:
      return { name: "report.csv", content: csv(sheet), type: "text/csv" };
  }
}

/** One format downloads as itself; several come as a zip, matching the filename the app chooses. */
function generate(db: DemoDb, command: ReportRequestCommand): DemoResponse {
  const table = runReport(db, command);
  const formats = command.formats?.length ? command.formats : ["csv"];
  const files = formats.map((format) => fileFor(format, table));

  if (files.length === 1) {
    return { status: 200, file: { content: files[0].content, type: files[0].type } };
  }

  return { status: 200, file: { content: zipStore(files.map((file) => ({ name: file.name, content: file.content }))), type: "application/zip" } };
}

function saveTemplate(db: DemoDb, template: ReportTemplate | undefined, command: ReportRequestCommand): ReportTemplate {
  const target: ReportTemplate = template ?? {
    id: nextId(db, "report"),
    createdAt: instantOn(db.today),
    createdBy: db.currentUserId,
    name: "",
    configuration: command,
    configurationVersion: 1,
    allowedActions: ALL_ACTIONS,
  };
  target.name = command.name?.trim() || "Report";
  target.configuration = command;
  target.updatedAt = instantOn(db.today);
  if (!template) {
    db.reportTemplates.push(target);
  }
  return target;
}

export function registerReports(router: DemoRouter): void {
  router.post("/report/template/list", (ctx) => paginate(ctx.db.reportTemplates, body<PagedRequest>(ctx), "name"));
  router.post("/report/template/:id/duplicate", (ctx) => {
    const original = findTemplate(ctx);
    if (!original) {
      return notFound("Template not found");
    }
    const command: ReportRequestCommand = { ...JSON.parse(JSON.stringify(original.configuration)), name: `${original.name} (copy)` };
    return saveTemplate(ctx.db, undefined, command);
  });
  router.post("/report/template/:id/generate", (ctx) => {
    const template = findTemplate(ctx);
    return template ? generate(ctx.db, template.configuration) : notFound("Template not found");
  });
  router.get("/report/template/:id", (ctx) => findTemplate(ctx) ?? notFound("Template not found"));
  router.put("/report/template/:id", (ctx) => {
    const template = findTemplate(ctx);
    return template ? saveTemplate(ctx.db, template, body<ReportRequestCommand>(ctx)) : notFound("Template not found");
  });
  router.delete("/report/template/:id", (ctx) => {
    ctx.db.reportTemplates = ctx.db.reportTemplates.filter((template) => template.id !== idParam(ctx, "id"));
    return ok();
  });
  router.post("/report/template", (ctx) => saveTemplate(ctx.db, undefined, body<ReportRequestCommand>(ctx)));

  router.post("/report/preview", (ctx) => {
    const table = runReport(ctx.db, body<ReportRequestCommand>(ctx));
    return { html: reportHtml(table), receiptCount: table.receiptCount, allowedActions: ALL_ACTIONS };
  });
  router.post("/report/receipts", (ctx) => {
    const command = body<ReportRequestCommand>(ctx);
    // The drill-in lists the receipts the preview counted: those in the groups and period, newest first, at most 100.
    const receipts = reportReceipts(ctx.db, command).sort((a, b) => (a.date < b.date ? 1 : -1));
    return { data: receipts.slice(0, 100), totalCount: receipts.length };
  });
  router.post("/report/generate", (ctx) => generate(ctx.db, body<ReportRequestCommand>(ctx)));
}

