import { DemoDb } from "./db";

/** One API call as the demo backend sees it: the path after `/api`, the query and the already-decoded body. */
export interface DemoRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
}

/** What a handler answers. `json` is the usual body; `file` is a download (a Blob when the client asked for one). */
export interface DemoResponse {
  status: number;
  json?: unknown;
  file?: { content: string | Uint8Array<ArrayBuffer>; type: string };
}

export interface DemoContext {
  db: DemoDb;
  req: DemoRequest;
  /** The `:name` segments of the matched route, as strings. */
  params: Record<string, string>;
}

export type DemoHandler = (ctx: DemoContext) => DemoResponse | unknown;

export function ok(json: unknown = {}): DemoResponse {
  return { status: 200, json };
}

export function fail(status: number, errorMsg: string): DemoResponse {
  return { status, json: { errorMsg } };
}

export function notFound(what = "Not found"): DemoResponse {
  return fail(404, what);
}

export function badRequest(message: string): DemoResponse {
  return fail(400, message);
}

export function isResponse(value: unknown): value is DemoResponse {
  return typeof value === "object" && value !== null && "status" in value && typeof (value as DemoResponse).status === "number";
}

export function body<T>(ctx: DemoContext): T {
  return (ctx.req.body ?? {}) as T;
}

export function idParam(ctx: DemoContext, name: string): number {
  return Number(ctx.params[name]);
}

export function nowIso(db: DemoDb): string {
  return `${db.today}T12:00:00Z`;
}
