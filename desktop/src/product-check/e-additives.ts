/**
 * A small guide to the food additives (E-numbers) that show up on shop shelves. It is bundled, not fetched, so a product
 * check works with nothing but Open Food Facts' own answer.
 *
 * The risk tiers are a general reading of the EFSA re-evaluations and of the EU's own restrictions, kept deliberately
 * cautious: `high` is for additives the EU has banned or restricted, or that EFSA could no longer call safe;
 * `moderate` is for ones with a sensitivity or intake warning; everything else listed is `safe` at normal intake. It is
 * a guide, not medical advice.
 */
import { marker } from "../i18n/marker";

export type AdditiveRisk = "safe" | "moderate" | "high";

export type AdditiveCategory =
  | "Colour"
  | "Preservative"
  | "Antioxidant"
  | "Emulsifier / thickener"
  | "Sweetener"
  | "Flavour enhancer"
  | "Acidity regulator"
  | "Other";

export interface AdditiveInfo {
  /** "E250" */
  code: string;
  name: string;
  category: AdditiveCategory | null;
  /** null for a code this guide does not know. */
  risk: AdditiveRisk | null;
}

type Entry = [name: string, category: AdditiveCategory, risk: AdditiveRisk];

const C = marker("Colour") as AdditiveCategory;
const P = marker("Preservative") as AdditiveCategory;
const A = marker("Antioxidant") as AdditiveCategory;
const E = marker("Emulsifier / thickener") as AdditiveCategory;
const S = marker("Sweetener") as AdditiveCategory;
const F = marker("Flavour enhancer") as AdditiveCategory;
const R = marker("Acidity regulator") as AdditiveCategory;
const O = marker("Other") as AdditiveCategory;

/** Keyed by the lower-case code without the "en:" prefix of Open Food Facts' tags ("e322i"). */
const ADDITIVES: Record<string, Entry> = {
  e100: ["Curcumin", C, "safe"],
  e101: ["Riboflavin", C, "safe"],
  e102: ["Tartrazine", C, "moderate"],
  e104: ["Quinoline yellow", C, "moderate"],
  e110: ["Sunset yellow FCF", C, "moderate"],
  e120: ["Carmine", C, "moderate"],
  e122: ["Azorubine", C, "moderate"],
  e123: ["Amaranth", C, "high"],
  e124: ["Ponceau 4R", C, "moderate"],
  e127: ["Erythrosine", C, "high"],
  e128: ["Red 2G", C, "high"],
  e129: ["Allura red AC", C, "moderate"],
  e131: ["Patent blue V", C, "moderate"],
  e132: ["Indigo carmine", C, "safe"],
  e133: ["Brilliant blue FCF", C, "safe"],
  e140: ["Chlorophylls", C, "safe"],
  e141: ["Copper chlorophyllins", C, "safe"],
  e150a: ["Plain caramel", C, "safe"],
  e150b: ["Caustic sulphite caramel", C, "moderate"],
  e150c: ["Ammonia caramel", C, "moderate"],
  e150d: ["Sulphite ammonia caramel", C, "moderate"],
  e153: ["Vegetable carbon", C, "moderate"],
  e160a: ["Carotenes", C, "safe"],
  e160b: ["Annatto", C, "moderate"],
  e160c: ["Paprika extract", C, "safe"],
  e160d: ["Lycopene", C, "safe"],
  e161b: ["Lutein", C, "safe"],
  e162: ["Beetroot red", C, "safe"],
  e163: ["Anthocyanins", C, "safe"],
  e170: ["Calcium carbonate", C, "safe"],
  e171: ["Titanium dioxide", C, "high"],
  e172: ["Iron oxides", C, "safe"],
  e200: ["Sorbic acid", P, "safe"],
  e202: ["Potassium sorbate", P, "safe"],
  e203: ["Calcium sorbate", P, "safe"],
  e210: ["Benzoic acid", P, "moderate"],
  e211: ["Sodium benzoate", P, "moderate"],
  e212: ["Potassium benzoate", P, "moderate"],
  e213: ["Calcium benzoate", P, "moderate"],
  e214: ["Ethyl p-hydroxybenzoate", P, "high"],
  e215: ["Sodium ethyl p-hydroxybenzoate", P, "high"],
  e218: ["Methyl p-hydroxybenzoate", P, "high"],
  e219: ["Sodium methyl p-hydroxybenzoate", P, "high"],
  e220: ["Sulphur dioxide", P, "moderate"],
  e221: ["Sodium sulphite", P, "moderate"],
  e222: ["Sodium hydrogen sulphite", P, "moderate"],
  e223: ["Sodium metabisulphite", P, "moderate"],
  e224: ["Potassium metabisulphite", P, "moderate"],
  e226: ["Calcium sulphite", P, "moderate"],
  e228: ["Potassium hydrogen sulphite", P, "moderate"],
  e234: ["Nisin", P, "safe"],
  e235: ["Natamycin", P, "safe"],
  e249: ["Potassium nitrite", P, "high"],
  e250: ["Sodium nitrite", P, "high"],
  e251: ["Sodium nitrate", P, "high"],
  e252: ["Potassium nitrate", P, "high"],
  e260: ["Acetic acid", R, "safe"],
  e261: ["Potassium acetate", P, "safe"],
  e262: ["Sodium acetates", P, "safe"],
  e270: ["Lactic acid", R, "safe"],
  e280: ["Propionic acid", P, "safe"],
  e281: ["Sodium propionate", P, "safe"],
  e282: ["Calcium propionate", P, "safe"],
  e283: ["Potassium propionate", P, "safe"],
  e290: ["Carbon dioxide", O, "safe"],
  e296: ["Malic acid", R, "safe"],
  e300: ["Ascorbic acid (vitamin C)", A, "safe"],
  e301: ["Sodium ascorbate", A, "safe"],
  e302: ["Calcium ascorbate", A, "safe"],
  e304: ["Ascorbyl palmitate", A, "safe"],
  e306: ["Tocopherols (vitamin E)", A, "safe"],
  e307: ["Alpha-tocopherol", A, "safe"],
  e308: ["Gamma-tocopherol", A, "safe"],
  e309: ["Delta-tocopherol", A, "safe"],
  e310: ["Propyl gallate", A, "moderate"],
  e315: ["Erythorbic acid", A, "safe"],
  e316: ["Sodium erythorbate", A, "safe"],
  e319: ["TBHQ", A, "moderate"],
  e320: ["BHA", A, "moderate"],
  e321: ["BHT", A, "moderate"],
  e322: ["Lecithins", E, "safe"],
  e325: ["Sodium lactate", R, "safe"],
  e326: ["Potassium lactate", R, "safe"],
  e327: ["Calcium lactate", R, "safe"],
  e330: ["Citric acid", R, "safe"],
  e331: ["Sodium citrates", R, "safe"],
  e332: ["Potassium citrates", R, "safe"],
  e333: ["Calcium citrates", R, "safe"],
  e334: ["Tartaric acid", R, "safe"],
  e335: ["Sodium tartrates", R, "safe"],
  e336: ["Potassium tartrates", R, "safe"],
  e338: ["Phosphoric acid", R, "moderate"],
  e339: ["Sodium phosphates", R, "moderate"],
  e340: ["Potassium phosphates", R, "moderate"],
  e341: ["Calcium phosphates", R, "moderate"],
  e350: ["Sodium malates", R, "safe"],
  e351: ["Potassium malate", R, "safe"],
  e352: ["Calcium malates", R, "safe"],
  e355: ["Adipic acid", R, "safe"],
  e363: ["Succinic acid", R, "safe"],
  e375: ["Niacin", O, "safe"],
  e385: ["Calcium disodium EDTA", A, "moderate"],
  e400: ["Alginic acid", E, "safe"],
  e401: ["Sodium alginate", E, "safe"],
  e402: ["Potassium alginate", E, "safe"],
  e406: ["Agar", E, "safe"],
  e407: ["Carrageenan", E, "moderate"],
  e410: ["Locust bean gum", E, "safe"],
  e412: ["Guar gum", E, "safe"],
  e413: ["Tragacanth", E, "safe"],
  e414: ["Gum arabic", E, "safe"],
  e415: ["Xanthan gum", E, "safe"],
  e416: ["Karaya gum", E, "safe"],
  e417: ["Tara gum", E, "safe"],
  e418: ["Gellan gum", E, "safe"],
  e422: ["Glycerol", O, "safe"],
  e425: ["Konjac", E, "safe"],
  e426: ["Soybean hemicellulose", E, "safe"],
  e427: ["Cassia gum", E, "safe"],
  e428: ["Gelatine", E, "safe"],
  e429: ["Peptones", E, "safe"],
  e432: ["Polysorbate 20", E, "moderate"],
  e433: ["Polysorbate 80", E, "moderate"],
  e434: ["Polysorbate 40", E, "moderate"],
  e435: ["Polysorbate 60", E, "moderate"],
  e436: ["Polysorbate 65", E, "moderate"],
  e440: ["Pectins", E, "safe"],
  e442: ["Ammonium phosphatides", E, "safe"],
  e450: ["Diphosphates", E, "moderate"],
  e451: ["Triphosphates", E, "moderate"],
  e452: ["Polyphosphates", E, "moderate"],
  e460: ["Cellulose", E, "safe"],
  e461: ["Methyl cellulose", E, "safe"],
  e463: ["Hydroxypropyl cellulose", E, "safe"],
  e464: ["Hydroxypropyl methyl cellulose", E, "safe"],
  e465: ["Ethyl methyl cellulose", E, "safe"],
  e466: ["Carboxymethyl cellulose", E, "moderate"],
  e469: ["Enzymatically hydrolysed carboxymethyl cellulose", E, "safe"],
  e470: ["Fatty acid salts", E, "safe"],
  e471: ["Mono- and diglycerides of fatty acids", E, "moderate"],
  e472: ["Esters of mono- and diglycerides", E, "moderate"],
  e473: ["Sucrose esters of fatty acids", E, "safe"],
  e475: ["Polyglycerol esters of fatty acids", E, "safe"],
  e476: ["Polyglycerol polyricinoleate", E, "safe"],
  e481: ["Sodium stearoyl-2-lactylate", E, "safe"],
  e491: ["Sorbitan monostearate", E, "safe"],
  e500: ["Sodium carbonates", R, "safe"],
  e501: ["Potassium carbonates", R, "safe"],
  e503: ["Ammonium carbonates", R, "safe"],
  e507: ["Hydrochloric acid", R, "safe"],
  e509: ["Calcium chloride", R, "safe"],
  e511: ["Magnesium chloride", R, "safe"],
  e516: ["Calcium sulphate", R, "safe"],
  e524: ["Sodium hydroxide", R, "safe"],
  e551: ["Silicon dioxide", O, "moderate"],
  e552: ["Calcium silicate", O, "safe"],
  e553b: ["Talc", O, "moderate"],
  e554: ["Sodium aluminium silicate", O, "moderate"],
  e559: ["Aluminium silicate", O, "moderate"],
  e570: ["Fatty acids", O, "safe"],
  e575: ["Glucono-delta-lactone", R, "safe"],
  e576: ["Sodium gluconate", O, "safe"],
  e620: ["Glutamic acid", F, "moderate"],
  e621: ["Monosodium glutamate", F, "moderate"],
  e622: ["Monopotassium glutamate", F, "moderate"],
  e625: ["Magnesium diglutamate", F, "moderate"],
  e627: ["Disodium guanylate", F, "moderate"],
  e631: ["Disodium inosinate", F, "moderate"],
  e635: ["Disodium 5'-ribonucleotides", F, "moderate"],
  e900: ["Dimethylpolysiloxane", O, "safe"],
  e901: ["Beeswax", O, "safe"],
  e903: ["Carnauba wax", O, "safe"],
  e904: ["Shellac", O, "safe"],
  e920: ["L-cysteine", O, "safe"],
  e924a: ["Potassium bromate", O, "high"],
  e924b: ["Calcium bromate", O, "high"],
  e927b: ["Carbamide", O, "high"],
  e938: ["Argon", O, "safe"],
  e941: ["Nitrogen", O, "safe"],
  e948: ["Oxygen", O, "safe"],
  e950: ["Acesulfame K", S, "moderate"],
  e951: ["Aspartame", S, "moderate"],
  e952: ["Cyclamate", S, "high"],
  e954: ["Saccharin", S, "moderate"],
  e955: ["Sucralose", S, "moderate"],
  e957: ["Thaumatin", S, "safe"],
  e959: ["Neohesperidine DC", S, "safe"],
  e960: ["Steviol glycosides", S, "safe"],
  e961: ["Neotame", S, "moderate"],
  e962: ["Aspartame-acesulfame salt", S, "moderate"],
  e965: ["Maltitol", S, "moderate"],
  e966: ["Lactitol", S, "moderate"],
  e967: ["Xylitol", S, "moderate"],
  e968: ["Erythritol", S, "moderate"],
  e420: ["Sorbitol", S, "moderate"],
  e421: ["Mannitol", S, "moderate"],
  e953: ["Isomalt", S, "moderate"],
  e1200: ["Polydextrose", O, "safe"],
  e1201: ["Polyvinylpyrrolidone", O, "moderate"],
  e1404: ["Oxidised starch", E, "safe"],
  e1410: ["Monostarch phosphate", E, "safe"],
  e1412: ["Distarch phosphate", E, "safe"],
  e1414: ["Acetylated distarch phosphate", E, "safe"],
  e1420: ["Acetylated starch", E, "safe"],
  e1422: ["Acetylated distarch adipate", E, "safe"],
  e1442: ["Hydroxypropyl distarch phosphate", E, "safe"],
  e1450: ["Starch sodium octenyl succinate", E, "safe"],
  e1451: ["Acetylated oxidised starch", E, "safe"],
  e1505: ["Triethyl citrate", O, "safe"],
  e1518: ["Glyceryl triacetate", O, "safe"],
  e1520: ["Propylene glycol", O, "moderate"],
};

const RISK_ORDER: Record<AdditiveRisk, number> = { high: 0, moderate: 1, safe: 2 };

/** Open Food Facts tags look like "en:e322i"; the guide keys on "e322" or the lettered form it knows. */
export function lookupAdditive(tag: string): AdditiveInfo {
  const normalized = tag.toLowerCase().replace(/^[a-z]{2}:/, "").trim();
  const base = normalized.match(/^e\d+/)?.[0] ?? normalized;
  // "e322i" / "e150d" / "e160aii": try the exact tag, then the number plus its one sub-letter, then the bare number.
  const lettered = normalized.match(/^e\d+[a-f]/)?.[0];
  const entry = ADDITIVES[normalized] ?? (lettered ? ADDITIVES[lettered] : undefined) ?? ADDITIVES[base];
  const code = (/^e\d/.test(normalized) ? normalized : base).toUpperCase();

  if (!entry) {
    return { code, name: "Unknown additive", category: null, risk: null };
  }

  return { code, name: entry[0], category: entry[1], risk: entry[2] };
}

/** Looks up every tag and orders them from the riskiest to the safest, unknown codes between moderate and safe. */
export function describeAdditives(tags: readonly string[]): AdditiveInfo[] {
  const seen = new Set<string>();
  const infos: AdditiveInfo[] = [];

  for (const tag of tags) {
    const info = lookupAdditive(tag);
    if (seen.has(info.code)) {
      continue;
    }
    seen.add(info.code);
    infos.push(info);
  }

  return infos.sort((a, b) => {
    const rankA = a.risk ? RISK_ORDER[a.risk] : 1.5;
    const rankB = b.risk ? RISK_ORDER[b.risk] : 1.5;

    return rankA - rankB || a.code.localeCompare(b.code, "en", { numeric: true });
  });
}
