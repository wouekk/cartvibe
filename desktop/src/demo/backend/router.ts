import { DemoContext, DemoHandler, DemoRequest, DemoResponse, fail, isResponse, ok } from "./http";
import { DemoDb } from "./db";

interface Route {
  method: string;
  pattern: RegExp;
  names: string[];
  handler: DemoHandler;
}

/** A tiny router: `/receipt/:id/duplicate` becomes a regular expression, first match wins. */
export class DemoRouter {
  private readonly routes: Route[] = [];

  public add(method: string, path: string, handler: DemoHandler): void {
    const names: string[] = [];
    const source = path
      .replace(/\/+$/, "")
      .split("/")
      .map((segment) => {
        if (segment.startsWith(":")) {
          names.push(segment.slice(1));
          return "([^/]+)";
        }
        return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("/");

    this.routes.push({ method, pattern: new RegExp(`^${source}/?$`), names, handler });
  }

  public get(path: string, handler: DemoHandler): void {
    this.add("GET", path, handler);
  }

  public post(path: string, handler: DemoHandler): void {
    this.add("POST", path, handler);
  }

  public put(path: string, handler: DemoHandler): void {
    this.add("PUT", path, handler);
  }

  public delete(path: string, handler: DemoHandler): void {
    this.add("DELETE", path, handler);
  }

  /** True when some route answers this method and path. */
  public matches(req: DemoRequest): boolean {
    return this.routes.some((route) => route.method === req.method && route.pattern.test(req.path));
  }

  public dispatch(db: DemoDb, req: DemoRequest): DemoResponse {
    for (const route of this.routes) {
      if (route.method !== req.method) {
        continue;
      }
      const match = route.pattern.exec(req.path);
      if (!match) {
        continue;
      }

      const params: Record<string, string> = {};
      route.names.forEach((name, index) => (params[name] = decodeURIComponent(match[index + 1])));
      const ctx: DemoContext = { db, req, params };
      const result = route.handler(ctx);
      return isResponse(result) ? result : ok(result);
    }

    return fail(404, "This part of CartVibe is not part of the demo.");
  }
}
