import { provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { ViewportService } from "../../services/viewport.service";
import { RowAction, RowActionsComponent } from "./row-actions.component";

interface Row {
  id: number;
  locked?: boolean;
}

describe("RowActionsComponent", () => {
  let fixture: ComponentFixture<RowActionsComponent<Row>>;
  const handset = signal(false);
  let canDelete = true;

  const actions: RowAction<Row>[] = [
    { key: "edit", label: "Edit", icon: "edit", testId: "thing-edit" },
    {
      key: "delete",
      label: "Delete",
      icon: "delete",
      testId: "thing-delete",
      destructive: true,
      visible: () => canDelete,
      disabled: (row) => !!row.locked,
    },
  ];

  beforeEach(async () => {
    handset.set(false);
    canDelete = true;
    await TestBed.configureTestingModule({
      imports: [RowActionsComponent],
      providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: ViewportService, useValue: { isHandset: handset } }],
    }).compileComponents();

    fixture = TestBed.createComponent(RowActionsComponent<Row>);
    fixture.componentRef.setInput("actions", actions);
    fixture.componentRef.setInput("row", { id: 1 });
    fixture.componentRef.setInput("menuTestId", "thing-menu");
    await fixture.whenStable();
  });

  const byTestId = (id: string): HTMLElement | null => fixture.nativeElement.querySelector(`[data-testid="${id}"]`);

  it("shows inline icon buttons on a wider screen, the delete one red, and no menu", () => {
    expect(byTestId("thing-edit")?.tagName).toBe("APP-BUTTON");
    expect(byTestId("thing-delete")?.tagName).toBe("APP-DELETE-BUTTON");
    expect(byTestId("thing-menu")).toBeNull();
  });

  it("shows only the more_vert menu button on a phone", async () => {
    handset.set(true);
    await fixture.whenStable();

    expect(byTestId("thing-menu")).not.toBeNull();
    expect(byTestId("thing-edit")).toBeNull();
    expect(byTestId("thing-delete")).toBeNull();
  });

  it("emits the picked action's key", () => {
    const run = vi.fn();
    fixture.componentInstance.run.subscribe(run);

    (byTestId("thing-edit")!.querySelector("button") as HTMLButtonElement).click();

    expect(run).toHaveBeenCalledWith("edit");
  });

  it("leaves out an action that is not visible for the row, and draws nothing without any", async () => {
    canDelete = false;
    fixture.componentRef.setInput("row", { id: 2 });
    await fixture.whenStable();
    expect(byTestId("thing-delete")).toBeNull();

    fixture.componentRef.setInput("actions", []);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent.trim()).toBe("");
  });

  it("disables an action the row does not allow", async () => {
    fixture.componentRef.setInput("row", { id: 3, locked: true });
    await fixture.whenStable();

    expect(fixture.componentInstance.isDisabled(actions[1])).toBe(true);
    expect((byTestId("thing-delete")!.querySelector("button") as HTMLButtonElement).disabled).toBe(true);
  });
});
