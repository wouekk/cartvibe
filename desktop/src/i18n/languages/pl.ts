import { LanguageDefinition } from "./language";
import { PL_CORE } from "./pl.messages";
import { PL_MORE } from "./pl.messages-more";

export const POLISH: LanguageDefinition = {
  code: "pl",
  label: "Polski",
  messages: { ...PL_CORE, ...PL_MORE },
  // One, 2-4 and 5+ (11-14 take the last form).
  plurals: {
    item: ["produkt", "produkty", "produktów"],
    list: ["lista", "listy", "list"],
    receipt: ["paragon", "paragony", "paragonów"],
    day: ["dzień", "dni", "dni"],
    month: ["miesiąc", "miesiące", "miesięcy"],
  },
  pluralIndex: (count) => {
    const lastTwo = count % 100;
    const last = count % 10;
    return count === 1 ? 0 : last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14) ? 1 : 2;
  },
};
