import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from "@angular/common/http";
import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { firstValueFrom } from "rxjs";
import { demoInterceptor, decodeBody } from "./demo-interceptor";
import { DemoSession } from "./demo-session";

describe("demoInterceptor", () => {
  let http: HttpClient;
  let session: DemoSession;
  let xhrOpen: ReturnType<typeof vi.spyOn>;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(withInterceptors([demoInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
    session = TestBed.inject(DemoSession);
    xhrOpen = vi.spyOn(XMLHttpRequest.prototype, "open");
    fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network in the demo"));
  });

  afterEach(() => {
    xhrOpen.mockRestore();
    fetchSpy.mockRestore();
  });

  it("answers an /api call from memory and never touches the network", async () => {
    const config = await firstValueFrom(http.get<{ aiPoweredReceipts: boolean }>("/api/featureConfig"));

    expect(config.aiPoweredReceipts).toBe(true);
    expect(xhrOpen).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("passes a JSON body through and keeps writes in the one backend", async () => {
    const list = await firstValueFrom(http.post<{ id: number; name: string }>("/api/shopping-list/group/1", { name: "BBQ" }));
    const lists = await firstValueFrom(http.get<{ id: number }[]>("/api/shopping-list/group/1"));

    expect(list.name).toBe("BBQ");
    expect(lists.some((entry) => entry.id === list.id)).toBe(true);
    expect(session.backend.handle({ method: "GET", path: "/shopping-list/group/1", query: new URLSearchParams(), body: undefined }).json).toEqual(lists);
  });

  it("reads query parameters and sends decimal strings as they are", async () => {
    const overview = await firstValueFrom(
      http.get<{ total: string }>("/api/overview/group/1", { params: { from: "2020-01-01", to: "2020-01-31" } }),
    );

    expect(overview.total).toBe("0.00");
  });

  it("raises an error status as an HttpErrorResponse the app's own interceptor can read", async () => {
    const error = await firstValueFrom(http.get("/api/receipt/987654")).catch((e: HttpErrorResponse) => e);

    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect((error as HttpErrorResponse).status).toBe(404);
    expect((error as HttpErrorResponse).error.errorMsg).toBeTruthy();
  });

  it("hands a download to a blob request as a Blob", async () => {
    const blob = await firstValueFrom(http.post("/api/export/1", { page: 1, pageSize: -1, filter: {} }, { responseType: "blob" }));

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/zip");
    expect(blob.size).toBeGreaterThan(50);
  });

  it("decodes a multipart body: JSON parts parsed, files described and never read", async () => {
    const form = new FormData();
    form.append("receipt", new Blob([JSON.stringify({ name: "Scanned" })], { type: "application/json" }));
    form.append("files", new File(["abc"], "a.jpg", { type: "image/jpeg" }));
    form.append("groupIds", "1");

    const decoded = (await decodeBody(form)) as Record<string, unknown[]>;

    expect(decoded["receipt"][0]).toEqual({ name: "Scanned" });
    expect(decoded["files"][0]).toEqual({ name: "a.jpg", type: "image/jpeg", size: 3 });
    expect(decoded["groupIds"]).toEqual(["1"]);
    expect(await decodeBody({ a: 1 })).toEqual({ a: 1 });
  });

  it("creates a receipt from a multipart upload", async () => {
    const form = new FormData();
    form.append(
      "receipt",
      new Blob([JSON.stringify({ name: "Photo", amount: "5.00", date: "2026-10-30", groupId: 1, paidByUserId: 1, status: "OPEN" })], { type: "application/json" }),
    );
    form.append("files", new File(["abc"], "a.jpg", { type: "image/jpeg" }));

    const receipt = await firstValueFrom(http.post<{ name: string; imageFiles: unknown[] }>("/api/receipt/withFiles", form));

    expect(receipt.name).toBe("Photo");
    expect(receipt.imageFiles).toHaveLength(1);
  });

  it("fails a call to another origin as an offline browser would", async () => {
    const error = await firstValueFrom(http.get("https://world.openfoodfacts.org/api/v2/product/1.json")).catch((e: HttpErrorResponse) => e);

    expect((error as HttpErrorResponse).status).toBe(0);
    expect(xhrOpen).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
