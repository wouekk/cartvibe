/** A brand the server has a logo for (GET /shopLogo): its id and the spellings that name it on a receipt. */
export interface ShopBrand {
  slug: string;
  name: string;
  aliases: string[];
}

/** Lower case, accents removed, everything that is not a letter or digit becomes a single space. */
export function normalizeShopName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/gi, "l")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface Candidate {
  text: string;
  logo: ShopBrand;
}

export const buildCandidates = (logos: ShopBrand[]): Candidate[] =>
  logos
    .flatMap((logo) =>
      [logo.name, logo.slug, ...(logo.aliases ?? [])].map((spelling) => ({ text: normalizeShopName(spelling), logo }))
    )
    .filter((candidate) => candidate.text.length > 0)
    // Longest first, so "carrefour polska" wins over "carrefour".
    .sort((a, b) => b.text.length - a.text.length);

/**
 * The known shop a receipt's shop name belongs to, or undefined (the monogram is shown then). A spelling matches when it
 * is the whole name or starts it ("Lidl Polska sp. z o.o."); a longer spelling (6+ characters) may also appear inside it
 * ("Sklep Biedronka nr 1234"). Short names such as "real" or "dm" never match from the middle of a text.
 */
export function findShopBrand(shopName: string | null | undefined, candidates: Candidate[]): ShopBrand | undefined {
  const text = normalizeShopName(shopName);
  if (!text) {
    return undefined;
  }

  const padded = ` ${text} `;
  for (const candidate of candidates) {
    if (text === candidate.text || text.startsWith(candidate.text + " ")) {
      return candidate.logo;
    }
    if (candidate.text.length >= 6 && padded.includes(` ${candidate.text} `)) {
      return candidate.logo;
    }
  }
  return undefined;
}
