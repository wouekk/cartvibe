import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { NgxsModule, Store } from "@ngxs/store";
import type { Mock } from "vitest";
import { APP_DIALOG_DATA, AppDialogRef } from "../../../dialog/app-dialog";
import { Group, Permission } from "../../../open-api";
import { AuthStore } from "../../../store/auth.store";
import { GroupStore } from "../../../store/group.store";
import { ReportsModule } from "../../reports.module";
import { AddGroupDialogComponent, AddGroupDialogData } from "./add-group-dialog.component";

const groups = [
  { id: 1, name: "home", isAllGroup: false },
  { id: 2, name: "Holiday house", isAllGroup: false },
  { id: 3, name: "Office", isAllGroup: false },
  { id: 99, name: "All", isAllGroup: true },
] as Group[];

describe("AddGroupDialogComponent", () => {
  let fixture: ComponentFixture<AddGroupDialogComponent>;
  let dialogRef: { close: Mock };

  const rows = (): HTMLElement[] => [...fixture.nativeElement.querySelectorAll('[data-testid="add-group-row"]')];
  const row = (name: string): HTMLElement => rows().find((element) => element.textContent?.includes(name))!;

  const open = async (data: AddGroupDialogData, reportGroups: number[] = [1, 2, 99]) => {
    dialogRef = { close: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [ReportsModule, NgxsModule.forRoot([])],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AppDialogRef, useValue: dialogRef },
        { provide: APP_DIALOG_DATA, useValue: data },
      ],
    }).compileComponents();
    const store = TestBed.inject(Store);
    TestBed.inject(GroupStore).setGroups(groups);
    const groupPermissions: { [groupId: number]: string[] } = {};
    for (const id of reportGroups) {
      groupPermissions[id] = [Permission.GroupReportsRead];
    }
    groupPermissions[3] ??= ["group.receipts.read"];
    TestBed.inject(AuthStore).setPermissions([], groupPermissions);
    fixture = TestBed.createComponent(AddGroupDialogComponent);
    await fixture.whenStable();
  };

  it("offers only real groups where reports may be generated", async () => {
    await open({ selectedGroupIds: [] });

    expect(rows().map((element) => element.textContent)).toEqual([
      expect.stringContaining("home"),
      expect.stringContaining("Holiday house"),
    ]);
    expect(row("home").textContent).toContain("HO");
  });

  it("marks the groups the report already covers", async () => {
    await open({ selectedGroupIds: ["2"] });

    expect(row("Holiday house").querySelector('[data-testid="add-group-selected"]')?.textContent).toContain("Added");
    expect(row("home").querySelector('[data-testid="add-group-select"]')).not.toBeNull();
  });

  it("adds and removes groups, and returns the chosen ids on Done", async () => {
    await open({ selectedGroupIds: ["2"] });

    (row("home").querySelector('[data-testid="add-group-select"]') as HTMLElement).click();
    await fixture.whenStable();
    (row("Holiday house").querySelector('[data-testid="add-group-selected"]') as HTMLElement).click();
    await fixture.whenStable();

    expect(row("home").querySelector('[data-testid="add-group-selected"]')).not.toBeNull();
    fixture.componentInstance.submit();
    expect(dialogRef.close).toHaveBeenCalledWith(["1"]);
  });

  it("keeps a chosen group the user can no longer report on out of sight but in the result", async () => {
    await open({ selectedGroupIds: ["3"] });

    expect(rows().some((element) => element.textContent?.includes("Office"))).toBe(false);
    fixture.componentInstance.submit();
    expect(dialogRef.close).toHaveBeenCalledWith(["3"]);
  });

  it("says so when the user can report on no group, and cancel returns nothing", async () => {
    await open({ selectedGroupIds: [] }, []);

    expect(rows()).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain("You don't have report access in any group.");
    fixture.componentInstance.cancel();
    expect(dialogRef.close).toHaveBeenCalledWith();
  });
});
