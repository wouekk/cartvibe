import { ReportColumn, ReportDetail, ReportPeriod, ReportRequestCommand } from "../../open-api";
import { localizeStoredTexts, restoreStoredTexts } from "./report-stored-text";

const GERMAN: Record<string, string> = {
  "Spending by shop": "Ausgaben nach Laden",
  Shop: "Laden",
  Spent: "Ausgegeben",
  "Generated {{generatedAt}}": "Erstellt am {{generatedAt}}",
};
const german = (text: string) => GERMAN[text] ?? text;

function command(overrides: Partial<ReportRequestCommand> = {}): ReportRequestCommand {
  return {
    name: "Spending by shop",
    groupIds: ["1"],
    period: { preset: ReportPeriod.PresetEnum.Ytd },
    filter: {},
    groupBy: [],
    detail: { mode: ReportDetail.ModeEnum.Aggregate, by: "shop" },
    columns: [
      { kind: ReportColumn.KindEnum.Dimension, name: "Shop", label: "Shop", field: "shop" },
      { kind: ReportColumn.KindEnum.Aggregate, name: "Spent", label: "Spent", aggFunc: ReportColumn.AggFuncEnum.Sum, measure: "amount" },
    ],
    subtotals: false,
    grandTotals: true,
    document: { title: "Spending by shop", intro: "Our shops", footer: "Generated {{generatedAt}}" },
    formats: [ReportRequestCommand.FormatsEnum.Pdf],
    ...overrides,
  };
}

describe("localizeStoredTexts", () => {
  it("translates the texts a person reads and leaves the configuration alone", () => {
    const localized = localizeStoredTexts(command(), german);

    expect(localized.name).toBe("Ausgaben nach Laden");
    expect(localized.document).toEqual({ title: "Ausgaben nach Laden", intro: "Our shops", footer: "Erstellt am {{generatedAt}}" });
    expect(localized.columns.map((column) => [column.name, column.label])).toEqual([
      ["Shop", "Laden"],
      ["Spent", "Ausgegeben"],
    ]);
    expect(localized.detail).toEqual(command().detail);
  });

  it("adds no key the stored command did not have", () => {
    const bare = command({ document: undefined, groupByLabels: undefined });
    delete bare.document;
    delete bare.groupByLabels;

    const localized = localizeStoredTexts(bare, german);

    expect("document" in localized).toBe(false);
    expect("groupByLabels" in localized).toBe(false);
  });

  it("is the command itself in English", () => {
    expect(localizeStoredTexts(command(), (text) => text)).toEqual(command());
  });
});

describe("restoreStoredTexts", () => {
  it("gives back the stored English for every text left as shown, and keeps what was typed", () => {
    const shown = localizeStoredTexts(command(), german);
    shown.document = { ...shown.document, intro: "Unsere Läden" };
    shown.columns = [shown.columns[1], shown.columns[0]];

    const saved = restoreStoredTexts(shown, command(), german);

    expect(saved.name).toBe("Spending by shop");
    expect(saved.document).toEqual({ title: "Spending by shop", intro: "Unsere Läden", footer: "Generated {{generatedAt}}" });
    expect(saved.columns.map((column) => column.label)).toEqual(["Spent", "Shop"]);
  });

  it("round-trips an untouched report exactly", () => {
    expect(restoreStoredTexts(localizeStoredTexts(command(), german), command(), german)).toEqual(command());
  });
});
