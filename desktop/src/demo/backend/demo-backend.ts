import { DemoDb } from "./db";
import { DemoRequest, DemoResponse } from "./http";
import { DemoRouter } from "./router";
import { createDemoDb } from "./seed";
import { registerAdmin } from "./routes/admin";
import { registerCatalog } from "./routes/catalog";
import { registerOverview } from "./routes/overview";
import { registerProducts } from "./routes/products";
import { registerReceipts } from "./routes/receipts";
import { registerReports } from "./routes/reports";
import { registerSession } from "./routes/session";
import { registerShopping } from "./routes/shopping";

/** Most specific first: a literal segment is registered before a `:param` that would also match it. */
function buildRouter(): DemoRouter {
  const router = new DemoRouter();
  registerSession(router);
  registerOverview(router);
  registerProducts(router);
  registerShopping(router);
  registerReceipts(router);
  registerReports(router);
  registerAdmin(router);
  registerCatalog(router);
  return router;
}

/**
 * The in-memory CartVibe API. It holds one sample household and answers the same paths and shapes as the Go API, so
 * the real app runs on it unchanged. `reset()` throws away every change and builds the household again.
 */
export class DemoBackend {
  private readonly router = buildRouter();

  private db: DemoDb;

  public constructor(private readonly today: string) {
    this.db = createDemoDb(today);
  }

  public reset(): void {
    this.db = createDemoDb(this.today);
  }

  /** Whether the demo answers this call (the interceptor lets nothing else near the network). */
  public handles(req: DemoRequest): boolean {
    return this.router.matches(req);
  }

  public handle(req: DemoRequest): DemoResponse {
    return this.router.dispatch(this.db, req);
  }
}
