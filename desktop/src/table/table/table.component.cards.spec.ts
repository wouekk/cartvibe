import { Component, provideZonelessChangeDetection, signal, TemplateRef, viewChild } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { ViewportService } from "../../services/viewport.service";
import { TableColumn } from "../table-column.interface";
import { Sort, TableDataSource } from "../table-types";
import { TableModule } from "../table.module";

interface Row {
  id: number;
  shop: string;
  date: string;
  amount: string;
  paidBy: string;
}

const ROWS: Row[] = [
  { id: 1, shop: "Lidl", date: "2026-11-01", amount: "12.50", paidBy: "Anna" },
  { id: 2, shop: "Aldi", date: "2026-11-02", amount: "8.00", paidBy: "Piotr" },
];

@Component({
  standalone: false,
  template: `
    <ng-template #actions let-element="element"><button type="button" [attr.data-testid]="'row-menu-' + element.id">Menu</button></ng-template>
    <ng-template #expanded let-element="element"><p data-testid="row-details">Details of {{ element.shop }}</p></ng-template>
    <app-table
      [columns]="columns()"
      [displayedColumns]="displayedColumns()"
      [dataSource]="dataSource"
      [selectionCheckboxes]="selectable()"
      [expandedRowTemplate]="expandable() ? expanded : undefined"
      (sorted)="sorts.push($event)"
    ></app-table>
  `,
})
class HostComponent {
  public readonly actions = viewChild.required<TemplateRef<unknown>>("actions");
  public readonly dataSource = new TableDataSource<Row>(ROWS);
  public readonly columns = signal<TableColumn[]>([]);
  public readonly displayedColumns = signal<string[]>([]);
  public readonly selectable = signal(false);
  public readonly expandable = signal(false);
  public readonly sorts: Sort[] = [];
}

/** A phone shows each row of app-table as a card. */
describe("TableComponent as cards on a phone", () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  const isHandset = signal(true);

  const all = (selector: string): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll(selector));
  const cards = (): HTMLElement[] => all("[data-testid=table-card]");
  const byTestId = (testId: string): HTMLElement | null => fixture.nativeElement.querySelector(`[data-testid=${testId}]`);

  /** Shop, date, amount, paid by and the row's actions; `roles` gives columns a place on the card. */
  const show = async (roles: Partial<Record<string, TableColumn["phone"]>> = {}, extra: string[] = []) => {
    await fixture.whenStable();
    const column = (id: string, header: string, sortable: boolean): TableColumn => ({
      columnHeader: header,
      matColumnDef: id,
      elementKey: id,
      sortable,
      ...(roles[id] ? { phone: roles[id] } : {}),
    });
    host.columns.set([
      column("shop", "Shop", true),
      column("date", "Receipt Date", true),
      column("amount", "Amount", true),
      column("paidBy", "Added by", false),
      { columnHeader: "Actions", matColumnDef: "actions", sortable: false, template: host.actions() },
    ]);
    host.displayedColumns.set([...extra, "shop", "date", "amount", "paidBy", "actions"]);
    await fixture.whenStable();
  };

  beforeEach(async () => {
    isHandset.set(true);
    await TestBed.configureTestingModule({
      declarations: [HostComponent],
      imports: [TableModule],
      providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: ViewportService, useValue: { isHandset } }],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
  });

  it("draws a card per row and no table", async () => {
    await show();

    expect(fixture.nativeElement.querySelector("table")).toBeNull();
    expect(cards()).toHaveLength(2);
  });

  it("keeps the table on a wider screen", async () => {
    isHandset.set(false);
    await show();

    expect(fixture.nativeElement.querySelector("table")).not.toBeNull();
    expect(byTestId("table-cards")).toBeNull();
    expect(byTestId("table-card-sort")).toBeNull();
  });

  it("makes the first column the title, labels the others, and puts the actions on the card, when nothing is declared", async () => {
    await show();

    const card = cards()[0];
    expect(card.textContent).toContain("Lidl");
    expect(Array.from(card.querySelectorAll("dt")).map((label) => label.textContent?.trim())).toEqual(["Receipt Date", "Amount", "Added by"]);
    expect(Array.from(card.querySelectorAll("dd")).map((value) => value.textContent?.trim())).toEqual(["2026-11-01", "12.50", "Anna"]);
    expect(card.querySelector("[data-testid=row-menu-1]")).not.toBeNull();
    expect(card.querySelector("dl [data-testid=row-menu-1]")).toBeNull();
  });

  it("places the cells where the columns say: a subtitle, the right-hand side, or nowhere", async () => {
    await show({ shop: "title", date: "subtitle", amount: "aside", paidBy: "hidden" });

    const card = cards()[1];
    expect(card.querySelector("dl")).toBeNull();
    expect(card.textContent).toContain("Aldi");
    expect(card.textContent).toContain("2026-11-02");
    expect(card.textContent).toContain("8.00");
    expect(card.textContent).not.toContain("Piotr");
  });

  it("lets a later column claim the title, and then labels the first one", async () => {
    await show({ date: "title" });

    expect(Array.from(cards()[0].querySelectorAll("dt")).map((label) => label.textContent?.trim())).toEqual(["Shop", "Amount", "Added by"]);
  });

  it("sorts from one control above the cards, since the headers are gone", async () => {
    await show();
    const select = byTestId("table-card-sort-column") as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.textContent?.trim())).toEqual(["Not sorted", "Shop", "Receipt Date", "Amount"]);
    expect((byTestId("table-card-sort-direction") as HTMLButtonElement).disabled).toBe(true);

    select.value = "amount";
    select.dispatchEvent(new Event("change"));
    await fixture.whenStable();
    expect(host.sorts.at(-1)).toEqual({ active: "amount", direction: "asc" });

    byTestId("table-card-sort-direction")!.click();
    await fixture.whenStable();
    expect(host.sorts.at(-1)).toEqual({ active: "amount", direction: "desc" });

    select.value = "";
    select.dispatchEvent(new Event("change"));
    await fixture.whenStable();
    expect(host.sorts.at(-1)).toEqual({ active: "", direction: "" });
  });

  it("offers no sort control while there are no rows to sort", async () => {
    host.dataSource.data = [];
    await show();

    expect(byTestId("table-card-sort")).toBeNull();
    host.dataSource.data = ROWS;
  });

  it("offers no sort control for a table that cannot be sorted", async () => {
    await fixture.whenStable();
    host.columns.set([{ columnHeader: "Shop", matColumnDef: "shop", elementKey: "shop", sortable: false }]);
    host.displayedColumns.set(["shop"]);
    await fixture.whenStable();

    expect(byTestId("table-card-sort")).toBeNull();
    expect(cards()).toHaveLength(2);
  });

  it("keeps row selection and the expandable details on a card", async () => {
    host.selectable.set(true);
    host.expandable.set(true);
    await show({}, ["select", "expand"]);

    expect(cards()[0].querySelector("hlm-checkbox")).not.toBeNull();
    expect(byTestId("row-details")).toBeNull();

    (cards()[0].querySelector("app-button button") as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(cards()[0].querySelector("[data-testid=row-details]")?.textContent).toContain("Details of Lidl");
    expect(cards()[1].querySelector("[data-testid=row-details]")).toBeNull();
  });
});
