import { DemoContext, body } from "./http";

export interface PagedRequest {
  page?: number;
  pageSize?: number;
  orderBy?: string;
  sortDirection?: string;
}

/** `shop_name` -> `shopName`: the API orders by column names, the data carries camelCase properties. */
function property(orderBy: string): string {
  return orderBy.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function compare(a: unknown, b: unknown): number {
  if (a === b) {
    return 0;
  }
  if (a === undefined || a === null || a === "") {
    return -1;
  }
  if (b === undefined || b === null || b === "") {
    return 1;
  }
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }

  const left = String(a);
  const right = String(b);
  const numeric = /^-?\d+(\.\d+)?$/;
  if (numeric.test(left) && numeric.test(right)) {
    return Number(left) - Number(right);
  }

  return left.localeCompare(right, "en", { sensitivity: "base" });
}

/** Orders by the request's column (stable), then cuts the page. `pageSize` -1 means everything. */
export function paginate<T>(items: T[], request: PagedRequest, defaultOrderBy = "id"): { data: T[]; totalCount: number } {
  const key = property(request.orderBy || defaultOrderBy);
  const direction = request.sortDirection === "desc" ? -1 : 1;
  const sorted = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const result = compare((a.item as Record<string, unknown>)[key], (b.item as Record<string, unknown>)[key]) * direction;
      return result !== 0 ? result : a.index - b.index;
    })
    .map((entry) => entry.item);

  const size = request.pageSize ?? -1;
  if (size < 1) {
    return { data: sorted, totalCount: sorted.length };
  }

  const start = (Math.max(request.page ?? 1, 1) - 1) * size;
  return { data: sorted.slice(start, start + size), totalCount: sorted.length };
}

export function pagedFromRequest<T>(ctx: DemoContext, items: T[], defaultOrderBy?: string) {
  return paginate(items, body<PagedRequest>(ctx), defaultOrderBy);
}
