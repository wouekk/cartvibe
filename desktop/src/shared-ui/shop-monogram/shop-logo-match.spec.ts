import { buildCandidates, findShopLogo, normalizeShopName } from "./shop-logo-match";

describe("shop logo matching", () => {
  const candidates = buildCandidates([
    { slug: "lidl", name: "Lidl", aliases: [] },
    { slug: "carrefour", name: "Carrefour", aliases: ["carrefour market"] },
    { slug: "carrefour-polska", name: "Carrefour Polska", aliases: [] },
    { slug: "zabka", name: "Żabka", aliases: [] },
    { slug: "dm", name: "dm", aliases: ["dm drogerie markt"] },
    { slug: "biedronka", name: "Biedronka", aliases: [] },
    { slug: "h-and-m", name: "H&M", aliases: ["h&m"] },
  ]);
  const match = (name: string | null | undefined) => findShopLogo(name, candidates)?.slug;

  it("normalizes case, accents, the Polish l-stroke and punctuation", () => {
    expect(normalizeShopName("  ŻABKA, Sp. z o.o.! ")).toBe("zabka sp z o o");
    expect(normalizeShopName("Łódź Café")).toBe("lodz cafe");
    expect(normalizeShopName(null)).toBe("");
  });

  it("matches the whole name and a name that starts with the shop", () => {
    expect(match("Lidl")).toBe("lidl");
    expect(match("LIDL Polska sp. z o.o.")).toBe("lidl");
    expect(match("Żabka")).toBe("zabka");
    expect(match("zabka")).toBe("zabka");
  });

  it("prefers the longest spelling", () => {
    expect(match("Carrefour Polska")).toBe("carrefour-polska");
    expect(match("Carrefour Market Lyon")).toBe("carrefour");
  });

  it("finds a long shop name in the middle, but never a short one", () => {
    expect(match("Sklep Biedronka nr 1234")).toBe("biedronka");
    expect(match("Haribo dm")).toBeUndefined();
    expect(match("dm drogerie markt Berlin")).toBe("dm");
  });

  it("does not match near misses or empty input", () => {
    expect(match("Lidlington Market")).toBeUndefined();
    expect(match("")).toBeUndefined();
    expect(match(undefined)).toBeUndefined();
  });

  it("matches names with symbols", () => {
    expect(match("H&M")).toBe("h-and-m");
  });
});
