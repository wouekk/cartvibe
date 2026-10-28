import { buildCandidates, findShopLogo, normalizeShopName } from "./shop-logo-match";
import { ShopLogo } from "./shop-logos.generated";

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

// The travel, telecom and delivery entries of scripts/shop-logos/shops.mjs whose spellings could collide, so the
// matching is tested whether or not their logo files have been downloaded yet.
const LOGOS: ShopLogo[] = [
  { slug: "uber", name: "Uber", aliases: ["uber bv", "uber poland", "uber france"] },
  { slug: "uber-eats", name: "Uber Eats", aliases: [] },
  { slug: "bolt", name: "Bolt", aliases: ["bolt operations", "bolt technology"] },
  { slug: "bolt-food", name: "Bolt Food", aliases: [] },
  { slug: "freenow", name: "FreeNow", aliases: ["free now", "mytaxi"] },
  { slug: "free-mobile", name: "Free Mobile", aliases: ["free telecom", "freebox"] },
  { slug: "ryanair", name: "Ryanair", aliases: ["ryanair dac", "ryanair sun"] },
  { slug: "easyjet", name: "easyJet", aliases: ["easy jet", "easyjet airline", "easyjet europe"] },
  { slug: "costa-coffee", name: "Costa Coffee", aliases: ["costa"] },
  { slug: "costa-cruises", name: "Costa Cruises", aliases: ["costa crociere", "costa croisieres", "costa kreuzfahrten"] },
  { slug: "msc-cruises", name: "MSC Cruises", aliases: ["msc crociere", "msc cruceros", "msc kreuzfahrten"] },
  { slug: "royal-caribbean", name: "Royal Caribbean", aliases: ["royal caribbean cruises", "royal caribbean international"] },
  { slug: "orange", name: "Orange", aliases: ["orange polska", "orange france", "orange sa"] },
  { slug: "play", name: "Play", aliases: ["p4 sp z o o"] },
  { slug: "deliveroo", name: "Deliveroo", aliases: [] },
];

const CANDIDATES = buildCandidates(LOGOS);
const slugOf = (shopName: string) => findShopLogo(shopName, CANDIDATES)?.slug;

describe("findShopLogo for travel, telecom and delivery brands", () => {
  it("finds rides and food delivery, the longer brand first", () => {
    expect(slugOf("Uber B.V.")).toBe("uber");
    expect(slugOf("Uber Eats")).toBe("uber-eats");
    expect(slugOf("BOLT OPERATIONS OÜ")).toBe("bolt");
    expect(slugOf("Bolt Food")).toBe("bolt-food");
    expect(slugOf("Deliveroo")).toBe("deliveroo");
  });

  it("finds airlines and cruise lines as printed on a booking", () => {
    expect(slugOf("Ryanair DAC")).toBe("ryanair");
    expect(slugOf("easyJet Airline Company")).toBe("easyjet");
    expect(slugOf("MSC Crociere S.A.")).toBe("msc-cruises");
    expect(slugOf("Royal Caribbean Cruises Ltd")).toBe("royal-caribbean");
  });

  it("keeps Costa Coffee and Costa Cruises apart", () => {
    expect(slugOf("Costa")).toBe("costa-coffee");
    expect(slugOf("Costa Crociere S.p.A.")).toBe("costa-cruises");
  });

  it("keeps FreeNow and Free Mobile apart", () => {
    expect(slugOf("Free Now")).toBe("freenow");
    expect(slugOf("Free Mobile")).toBe("free-mobile");
  });

  it("finds a telecom without lighting up ordinary words", () => {
    expect(slugOf("Orange Polska S.A.")).toBe("orange");
    expect(slugOf("Play")).toBe("play");
    // Spellings under 6 letters match only at the start of the name, never inside it.
    expect(slugOf("Kids play centre")).toBeUndefined();
    expect(slugOf("Playa Bonita")).toBeUndefined();
  });
});
