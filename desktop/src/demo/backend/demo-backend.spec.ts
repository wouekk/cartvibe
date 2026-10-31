import { DemoBackend } from "./demo-backend";
import { DemoResponse } from "./http";
import { parseCents } from "./money";

const TODAY = "2026-10-31";

function call(backend: DemoBackend, method: string, path: string, body?: unknown, query = ""): DemoResponse {
  return backend.handle({ method, path, query: new URLSearchParams(query), body });
}

function json<T>(response: DemoResponse): T {
  expect(response.status, JSON.stringify(response.json)).toBe(200);
  return response.json as T;
}

function receiptsOf(backend: DemoBackend, filter: object = {}, extra: object = {}) {
  return json<{ data: { id: number; name: string; amount: string; shopName?: string; date: string }[]; totalCount: number }>(
    call(backend, "POST", "/receipt/group/1", { page: 1, pageSize: 50, orderBy: "date", sortDirection: "desc", filter, ...extra }),
  );
}

describe("DemoBackend", () => {
  let backend: DemoBackend;

  beforeEach(() => {
    backend = new DemoBackend(TODAY);
  });

  describe("session", () => {
    it("signs the sample admin in with everything the app reads on start", () => {
      const data = json<Record<string, any>>(call(backend, "GET", "/user/appData"));

      expect(data["claims"].username).toBe("alex");
      expect(data["groups"]).toHaveLength(1);
      expect(data["appPermissions"]).toContain("app.users.read");
      expect(data["groupPermissions"]["1"]).toContain("group.receipts.read");
      expect(data["featureConfig"].aiPoweredReceipts).toBe(true);
      expect(data["currencyDisplay"]).toBe(" €");
      expect(data["groupCategories"]["1"].length).toBeGreaterThan(0);
      expect(Array.isArray(data["groupReceiptRequirements"] ? Object.values(data["groupReceiptRequirements"]) : [])).toBe(true);
    });

    it("accepts any login and refreshes the token without a server", () => {
      expect(json<Record<string, any>>(call(backend, "POST", "/login", { username: "x", password: "y" }))["claims"].userId).toBe(1);
      expect(json<Record<string, any>>(call(backend, "POST", "/token"))["exp"]).toBeGreaterThan(Date.now() / 1000);
    });

    it("answers an unknown endpoint with a 404 and a message instead of throwing", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const response = call(backend, "GET", "/nothing/here");

      expect(response.status).toBe(404);
      expect((response.json as { errorMsg: string }).errorMsg).toContain("demo");
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe("overview", () => {
    it("folds this month's receipts into the figures the Dashboard shows", () => {
      const overview = json<Record<string, any>>(call(backend, "GET", "/overview/group/1", undefined, "from=2026-10-01&to=2026-10-31"));

      expect(overview["total"]).toBe("142.85");
      expect(overview["receiptCount"]).toBe(4);
      expect(overview["openReceiptCount"]).toBe(1);
      expect(overview["unhealthyTotal"]).toBe("21.18");
      expect(overview["unplannedTotal"]).toBe("3.68");
      expect(overview["warrantyCount"]).toBe(2);
      expect(overview["months"]).toHaveLength(6);
      expect(overview["trendUnit"]).toBe("MONTH");
      expect(overview["tags"].map((tag: { name: string }) => tag.name)).toEqual(["Weekly shop"]);
    });

    it("splits spending by category and keeps what no line covers as Uncategorized", () => {
      const overview = json<Record<string, any>>(call(backend, "GET", "/overview/group/1", undefined, "from=2026-07-01&to=2026-07-31"));
      const sum = overview["categories"].reduce((total: number, row: { total: string }) => total + parseCents(row.total), 0);

      expect(sum).toBe(parseCents(overview["total"]));
      expect(overview["categories"].some((row: { name: string }) => row.name === "Uncategorized")).toBe(true);
    });

    it("draws a short period by day and rejects a bad one", () => {
      const week = json<Record<string, any>>(call(backend, "GET", "/overview/group/1", undefined, "from=2026-10-25&to=2026-10-31"));
      expect(week["trendUnit"]).toBe("DAY");
      expect(week["trend"]).toHaveLength(7);

      expect(call(backend, "GET", "/overview/group/1", undefined, "from=2026-10-31&to=2026-10-01").status).toBe(400);
      expect(call(backend, "GET", "/overview/group/1", undefined, "month=October").status).toBe(400);
    });

    it("lists the lines behind a tile, newest receipt first", () => {
      const lines = json<{ name: string; receiptDate: string }[]>(
        call(backend, "GET", "/overview/group/1/products", undefined, "kind=UNHEALTHY&from=2026-10-01&to=2026-10-31"),
      );

      expect(lines.map((line) => line.name)).toContain("Cola 2 l");
      expect(lines.length).toBe(4);
      expect(lines[0].receiptDate >= lines[lines.length - 1].receiptDate).toBe(true);
      expect(call(backend, "GET", "/overview/group/1/products", undefined, "kind=NOPE").status).toBe(400);
    });
  });

  describe("receipts", () => {
    it("pages, sorts and filters like the receipts table asks", () => {
      const all = receiptsOf(backend);
      expect(all.totalCount).toBe(14);
      expect(all.data[0].date >= all.data[1].date).toBe(true);

      const cheapestFirst = receiptsOf(backend, {}, { orderBy: "amount", sortDirection: "asc", pageSize: 3 });
      expect(cheapestFirst.data).toHaveLength(3);
      expect(cheapestFirst.totalCount).toBe(14);
      expect(parseCents(cheapestFirst.data[0].amount)).toBeLessThanOrEqual(parseCents(cheapestFirst.data[1].amount));

      const october = receiptsOf(backend, { date: { operation: "BETWEEN", value: ["2026-10-01", "2026-10-31"] } });
      expect(october.totalCount).toBe(4);

      expect(receiptsOf(backend, { status: { operation: "CONTAINS", value: ["OPEN"] } }).totalCount).toBe(1);
      expect(receiptsOf(backend, { paidBy: { operation: "CONTAINS", value: [3] } }).totalCount).toBe(3);
      expect(receiptsOf(backend, { amount: { operation: "GREATER_THAN", value: 100 } }).totalCount).toBe(1);
      expect(receiptsOf(backend, { warrantyActive: true }).totalCount).toBe(2);
    });

    it("searches the shop, the name and the product lines, and says which line matched", () => {
      const result = receiptsOf(backend, { search: "salmon" });

      expect(result.totalCount).toBe(1);
      expect((result.data[0] as { searchMatches?: { name: string }[] }).searchMatches?.[0].name).toBe("Salmon fillet");
      expect(receiptsOf(backend, { search: "luigi" }).totalCount).toBe(2);
    });

    it("creates, edits, settles, duplicates and deletes a receipt in memory", () => {
      const created = json<{ id: number; amount: string; status: string }>(
        call(backend, "POST", "/receipt", {
          name: "Bakery run",
          shopName: "Corner Bakery",
          amount: "7,50",
          date: "2026-10-30T00:00:00Z",
          groupId: 1,
          paidByUserId: 1,
          status: "OPEN",
        }),
      );
      expect(created.amount).toBe("7.50");
      expect(receiptsOf(backend).totalCount).toBe(15);

      const settled = json<{ status: string; resolvedDate?: string }>(
        call(backend, "PUT", `/receipt/${created.id}`, {
          name: "Bakery run",
          amount: "8.00",
          date: "2026-10-30",
          groupId: 1,
          paidByUserId: 1,
          status: "RESOLVED",
        }),
      );
      expect(settled.status).toBe("RESOLVED");
      expect(settled.resolvedDate).toBeTruthy();

      const copy = json<{ id: number; status: string }>(call(backend, "POST", `/receipt/${created.id}/duplicate`));
      expect(copy.id).not.toBe(created.id);
      expect(copy.status).toBe("OPEN");

      call(backend, "DELETE", `/receipt/${created.id}`);
      expect(call(backend, "GET", `/receipt/${created.id}`).status).toBe(404);
      expect(receiptsOf(backend).totalCount).toBe(15);
    });

    it("sends a warranty end as a bare day, which is what the days-left maths reads", () => {
      const withWarranty = receiptsOf(backend, { warrantyActive: true }).data as { warrantyUntil?: string }[];

      expect(withWarranty).toHaveLength(2);
      expect(withWarranty.map((receipt) => receipt.warrantyUntil)).toEqual([expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)]);
    });

    it("sets one field at a time, as the view page does", () => {
      expect(json<{ name: string }>(call(backend, "PUT", "/receipt/1/name", { name: "Big shop" })).name).toBe("Big shop");
      expect(json<{ amount: string }>(call(backend, "PUT", "/receipt/1/amount", { amount: "30" })).amount).toBe("30.00");
      expect(json<{ date: string }>(call(backend, "PUT", "/receipt/1/date", { date: "2026-10-20" })).date).toBe("2026-10-20T00:00:00Z");
      expect(json<{ warrantyUntil?: string }>(call(backend, "PUT", "/receipt/1/warranty", { warrantyUntil: "2027-01-01" })).warrantyUntil).toBe("2027-01-01");
    });

    it("edits product lines and labels, and keeps the category name with the id", () => {
      const view = json<{ products: { id: number; categoryId?: number }[] }>(call(backend, "GET", "/receipt-product/receipt/1"));
      const first = view.products[0];

      const labelled = json<{ categoryId?: number; foodGroup: string; tags: { id: number }[] }>(
        call(backend, "PUT", `/receipt-product/product/${first.id}/labels`, { categoryId: 7, tagIds: [2] }),
      );
      expect(labelled.foodGroup).toBe("Pantry");
      expect(labelled.tags.map((tag) => tag.id)).toEqual([2]);

      call(backend, "PUT", "/category/7", { name: "Cupboard" });
      expect(json<{ products: { id: number; foodGroup: string }[] }>(call(backend, "GET", "/receipt-product/receipt/1")).products.find((p) => p.id === first.id)?.foodGroup).toBe("Cupboard");

      call(backend, "DELETE", "/category/7");
      const after = json<{ products: { id: number; categoryId?: number }[] }>(call(backend, "GET", "/receipt-product/receipt/1")).products.find((p) => p.id === first.id);
      expect(after?.categoryId).toBeUndefined();
    });

    it("reads a receipt again from the script, scaled to the receipt's total", () => {
      call(backend, "PUT", "/receipt/2/amount", { amount: "40.00" });
      const view = json<{ status: string; products: { amount: string }[] }>(call(backend, "POST", "/receipt-product/receipt/2/read"));

      expect(view.status).toBe("DONE");
      expect(view.products.reduce((sum, product) => sum + parseCents(product.amount), 0)).toBe(4000);
    });
  });

  describe("scripted AI", () => {
    it("turns a Quick Scan into the same sample receipt every time, with lines and a notification", () => {
      const before = receiptsOf(backend).totalCount;
      const notifications = json<unknown[]>(call(backend, "GET", "/notifications")).length;

      json(call(backend, "POST", "/receipt/quickScan", { files: [{ name: "a.jpg" }], groupIds: ["1"], paidByUserIds: ["1"], statuses: ["OPEN"] }));

      const after = receiptsOf(backend);
      expect(after.totalCount).toBe(before + 1);
      const scanned = after.data.find((receipt) => receipt.shopName === "Corner Bakery");
      expect(scanned?.name).toBe("Sunday brunch");
      expect(scanned?.amount).toBe("16.90");
      expect(json<{ products: unknown[] }>(call(backend, "GET", `/receipt-product/receipt/${scanned?.id}`)).products).toHaveLength(5);
      const latest = json<{ title: string; body: string }[]>(call(backend, "GET", "/notifications"))[0];
      expect(json<unknown[]>(call(backend, "GET", "/notifications")).length).toBe(notifications + 1);
      // Worded and tokenised like the API's own, so the app translates and links it.
      expect(latest.title).toBe("Receipt ready");
      expect(latest.body).toContain("has been read by the AI. Check it out! ${receiptId:");
    });

    it("answers Magic Fill with the same fixed draft and never saves it", () => {
      const before = receiptsOf(backend).totalCount;
      const draft = json<{ id: number; name: string; amount: string }>(call(backend, "POST", "/receiptImage/magicFill", { file: [{ name: "a.jpg" }] }));

      expect(draft.id).toBe(0);
      expect(draft.amount).toBe("16.90");
      expect(receiptsOf(backend).totalCount).toBe(before);
    });

    it("draws a receipt picture from the receipt's own lines", () => {
      const image = json<{ encodedImage: string }>(call(backend, "GET", "/receiptImage/1"));

      expect(image.encodedImage.startsWith("data:image/svg+xml")).toBe(true);
      expect(decodeURIComponent(image.encodedImage)).toContain("Greenfield Market");
    });
  });

  describe("shopping lists", () => {
    it("adds an item with a stand-in classification, crosses it off and completes the list", () => {
      const item = json<{ id: number; health: string; foodGroup: string; shoppingListId: number }>(
        call(backend, "POST", "/shopping-list/1/item", { name: "Cherry tomatoes", quantity: "1" }),
      );
      expect(item.health).toBe("HEALTHY");
      expect(item.foodGroup).toBe("Fresh Produce");

      const checked = json<{ isChecked: boolean; checkedByUserId?: number }>(call(backend, "PUT", `/shopping-list/item/${item.id}/checked`, { isChecked: true }));
      expect(checked.isChecked).toBe(true);
      expect(checked.checkedByUserId).toBe(1);

      const list = json<{ items: { isChecked: boolean }[] }>(call(backend, "PUT", "/shopping-list/1/checked", { isChecked: true }));
      expect(list.items.every((entry) => entry.isChecked)).toBe(true);

      const undone = json<{ items: { isChecked: boolean }[] }>(call(backend, "PUT", "/shopping-list/1/checked", { isChecked: false }));
      expect(undone.items.every((entry) => !entry.isChecked)).toBe(true);
    });

    it("keeps an amount as the plain decimal the client sent", () => {
      const item = json<{ id: number; amount?: string }>(call(backend, "POST", "/shopping-list/1/item", { name: "Flour", amount: "0,125", unit: "kg" }));
      expect(item.amount).toBe("0.125");
      expect(json<{ amount?: string }>(call(backend, "PUT", `/shopping-list/item/${item.id}`, { name: "Flour", amount: "2", unit: "l" })).amount).toBe("2");
    });

    it("creates, renames and deletes a list", () => {
      const list = json<{ id: number; items: unknown[] }>(call(backend, "POST", "/shopping-list/group/1", { name: "BBQ" }));
      expect(list.items).toEqual([]);
      expect(json<{ name: string }>(call(backend, "PUT", `/shopping-list/${list.id}`, { name: "Barbecue" })).name).toBe("Barbecue");

      call(backend, "DELETE", `/shopping-list/${list.id}`);
      expect(json<{ id: number }[]>(call(backend, "GET", "/shopping-list/group/1")).some((entry) => entry.id === list.id)).toBe(false);
    });

    it("compares an attached receipt with the list and reports what was not planned", () => {
      const trips = json<{ unplannedProducts: string[]; plannedItemCount: number }[]>(call(backend, "GET", "/shopping-list/1/trip"));
      expect(trips).toHaveLength(1);
      expect(trips[0].unplannedProducts).toEqual(["Cola 2 l", "Milk chocolate bar"]);

      json(call(backend, "POST", "/shopping-list/2/trip", { receiptId: 2 }));
      const attached = json<{ unplannedProducts: string[] }[]>(call(backend, "GET", "/shopping-list/2/trip"));
      expect(attached).toHaveLength(1);
      expect(attached[0].unplannedProducts.length).toBeGreaterThan(0);
    });
  });

  describe("catalogue and people", () => {
    it("creates, renames and counts categories and tags", () => {
      const category = json<{ id: number }>(call(backend, "POST", "/category", { name: "Pet shop" }));
      expect(json<number>(call(backend, "GET", "/category/pet shop"))).toBe(1);

      const paged = json<{ data: { name: string; numberOfReceipts: number }[]; totalCount: number }>(
        call(backend, "POST", "/category/getPagedCategories", { page: 1, pageSize: 50, orderBy: "name", sortDirection: "asc" }),
      );
      expect(paged.data[0].name <= paged.data[1].name).toBe(true);
      expect(paged.data.find((entry) => entry.name === "Dairy")?.numberOfReceipts).toBeGreaterThan(3);

      call(backend, "DELETE", `/category/${category.id}`);
      expect(json<number>(call(backend, "GET", "/category/pet shop"))).toBe(0);

      const tag = json<{ id: number }>(call(backend, "POST", "/tag", { name: "BBQ", showOnDashboard: true }));
      expect(json<Record<string, any>>(call(backend, "GET", "/overview/group/1", undefined, "month=2026-10"))["tags"].map((entry: { name: string }) => entry.name)).toContain("BBQ");
      call(backend, "DELETE", `/tag/${tag.id}`);
    });

    it("keeps the signed-in user and the only household", () => {
      expect(call(backend, "DELETE", "/user/1").status).toBe(400);
      expect(call(backend, "DELETE", "/group/1").status).toBe(400);

      const user = json<{ id: number }>(call(backend, "POST", "/user", { username: "kim", displayName: "Kim", password: "x", isDummyUser: false }));
      expect(json<unknown[]>(call(backend, "GET", "/user"))).toHaveLength(4);
      call(backend, "DELETE", `/user/${user.id}`);
      expect(json<unknown[]>(call(backend, "GET", "/user"))).toHaveLength(3);

      // The receipts a deleted user paid for go with them, as the confirmation on the real page says.
      call(backend, "DELETE", "/user/3");
      expect(receiptsOf(backend).totalCount).toBe(11);
    });

    it("replaces the preferences like the real endpoint and keeps them until a reset", () => {
      const current = json<Record<string, unknown>>(call(backend, "GET", "/userPreferences"));
      call(backend, "PUT", "/userPreferences", { ...current, monthlySpendingGoal: "900.00" });
      expect(json<{ monthlySpendingGoal: string }>(call(backend, "GET", "/userPreferences")).monthlySpendingGoal).toBe("900.00");

      backend.reset();
      expect(json<{ monthlySpendingGoal: string }>(call(backend, "GET", "/userPreferences")).monthlySpendingGoal).toBe("650.00");
    });

    it("never hands a stored AI key back", () => {
      call(backend, "PUT", "/receiptProcessingSettings/1", { name: "Mine", aiType: "OPEN_AI", ocrEngine: "TESSERACT", key: "sk-secret" });
      const settings = json<{ key?: string; name: string }>(call(backend, "GET", "/receiptProcessingSettings/1"));

      expect(settings.name).toBe("Mine");
      expect(settings.key).toBeUndefined();
    });
  });

  describe("reports", () => {
    it("previews a starter report with exact totals and counts the receipts it covers", () => {
      const template = json<{ configuration: object }>(call(backend, "GET", "/report/template/3"));
      const preview = json<{ html: string; receiptCount: number }>(call(backend, "POST", "/report/preview", template.configuration));

      expect(preview.receiptCount).toBe(14);
      expect(preview.html).toContain("Month by month");
      expect(preview.html).toContain("142.85");

      // A report with a grand total labels it in its first dimension column, and subtotals sit under their level.
      const byShop = json<{ configuration: object }>(call(backend, "GET", "/report/template/2"));
      expect(json<{ html: string }>(call(backend, "POST", "/report/preview", byShop.configuration)).html).toContain('<td class="">Total</td>');
      const byCategory = json<{ configuration: object }>(call(backend, "GET", "/report/template/1"));
      expect(json<{ html: string }>(call(backend, "POST", "/report/preview", byCategory.configuration)).html).toContain("Total 2026-10");
    });

    it("counts every line once in a report that is not cut by tag, so the category and shop reports agree", () => {
      const grandTotal = (id: number): string => {
        const template = json<{ configuration: object }>(call(backend, "GET", `/report/template/${id}`));
        const html = json<{ html: string }>(call(backend, "POST", "/report/preview", template.configuration)).html;
        // The grand total is the last emphasised row; its first figure is the money column.
        const totalRows = html.match(/<tr class="total">.*?<\/tr>/g) ?? [];
        return /<td class="num">(\d+\.\d{2})<\/td>/.exec(totalRows[totalRows.length - 1] ?? "")?.[1] ?? "";
      };

      const all = receiptsOf(backend, { date: { operation: "BETWEEN", value: ["2026-01-01", "2026-10-31"] } }).data;
      const expected = all.reduce((sum, receipt) => sum + parseCents(receipt.amount), 0);

      expect(parseCents(grandTotal(1))).toBe(expected);
      expect(parseCents(grandTotal(2))).toBe(expected);
      expect(parseCents(grandTotal(3))).toBe(expected);
    });

    it("repeats a line per tag only when the report groups by tag", () => {
      const byTag = {
        name: "By tag",
        groupIds: ["1"],
        period: { preset: "ytd" },
        groupBy: [],
        detail: { mode: "aggregate", by: "tag" },
        columns: [{ kind: "dimension", name: "Tag", field: "tag" }, { kind: "aggregate", name: "Spent", aggFunc: "SUM", measure: "amount" }],
        grandTotals: true,
        formats: ["csv"],
      };
      const html = json<{ html: string }>(call(backend, "POST", "/report/preview", byTag)).html;

      expect(html).toContain("Weekly shop");
      expect(html).toContain("No tag");
    });

    it("lists the receipts behind a preview and downloads CSV, XLSX and PDF", () => {
      const configuration = json<{ configuration: Record<string, unknown> }>(call(backend, "GET", "/report/template/2")).configuration;

      const drill = json<{ data: unknown[]; totalCount: number }>(call(backend, "POST", "/report/receipts", configuration));
      expect(drill.totalCount).toBe(14);
      expect(drill.data).toHaveLength(14);

      for (const [format, type] of [["csv", "text/csv"], ["xlsx", "spreadsheetml"], ["pdf", "application/pdf"]]) {
        const response = call(backend, "POST", "/report/generate", { ...configuration, formats: [format] });
        expect(response.status).toBe(200);
        expect(response.file?.type, format).toContain(type);
      }

      const both = call(backend, "POST", "/report/generate", { ...configuration, formats: ["csv", "pdf"] });
      expect(both.file?.type).toBe("application/zip");
    });

    it("saves, duplicates and deletes a template", () => {
      const saved = json<{ id: number; name: string }>(call(backend, "POST", "/report/template", { name: "Mine", groupIds: ["1"], period: { preset: "this_month" }, detail: { mode: "records" }, columns: [], formats: ["csv"] }));
      expect(saved.name).toBe("Mine");

      const copy = json<{ id: number; name: string }>(call(backend, "POST", `/report/template/${saved.id}/duplicate`));
      expect(copy.name).toBe("Mine (copy)");

      call(backend, "DELETE", `/report/template/${saved.id}`);
      expect(call(backend, "GET", `/report/template/${saved.id}`).status).toBe(404);
    });
  });

  describe("exports", () => {
    it("zips the filtered receipts as CSV", () => {
      const response = call(backend, "POST", "/export/1", { page: 1, pageSize: -1, filter: {} });

      expect(response.file?.type).toBe("application/zip");
      expect((response.file?.content as Uint8Array)[0]).toBe(0x50);
      expect((response.file?.content as Uint8Array)[1]).toBe(0x4b);
    });
  });

  describe("reset", () => {
    it("throws every change away", () => {
      call(backend, "DELETE", "/receipt/1");
      call(backend, "POST", "/shopping-list/group/1", { name: "Extra" });
      expect(receiptsOf(backend).totalCount).toBe(13);

      backend.reset();

      expect(receiptsOf(backend).totalCount).toBe(14);
      expect(json<unknown[]>(call(backend, "GET", "/shopping-list/group/1"))).toHaveLength(3);
    });
  });

  it("has an answer for every endpoint the generated client can call, except the live pieces", () => {
    const declared = [
      ["GET", "/featureConfig"],
      ["GET", "/user/appData"],
      ["GET", "/dashboardLayout"],
      ["GET", "/exchangeRate"],
      ["GET", "/systemSettings"],
      ["GET", "/role"],
      ["GET", "/permission"],
      ["GET", "/report/template/options"],
      ["GET", "/notifications/notificationCount"],
      ["GET", "/shopLogo/status"],
      ["POST", "/systemTask/getPagedSystemTasks"],
      ["POST", "/receiptProcessingSettings/getPagedProcessingSettings"],
      ["POST", "/group/getPagedGroups"],
      ["POST", "/user/getPagedUsers"],
      ["POST", "/tag/getPagedTags"],
    ];

    for (const [method, path] of declared) {
      expect(backend.handles({ method, path, query: new URLSearchParams(), body: {} }), `${method} ${path}`).toBe(true);
    }
  });
});
