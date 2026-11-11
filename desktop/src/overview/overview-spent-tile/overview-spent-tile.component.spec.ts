import { Component, provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { Store } from "@ngxs/store";
import { of, throwError } from "rxjs";
import type { Mock } from "vitest";
import { GroupOverview, Permission, UserPreferences, UserPreferencesService } from "../../open-api";
import { SnackbarService } from "../../services";
import { AuthState } from "../../store/auth.state";
import { SetPermissions, SetUserPreferences } from "../../store/auth.state.actions";
import { StoreModule } from "../../store/store.module";
import { ResolvedPeriod } from "../overview-period";
import { OverviewSpentTileComponent } from "./overview-spent-tile.component";

// The tile is a cell the page places, so it is tested the way it is used: on a host's <div>.
@Component({
  imports: [OverviewSpentTileComponent],
  template: `<div
    app-overview-spent-tile
    [overview]="overview()"
    [period]="period()"
    [periodLabel]="period()?.label ?? ''"
    [goal]="goal()"
    [change]="change()"
    [changeIsIncrease]="changeIsIncrease()"
    [groupId]="7"
    [receiptsQuery]="{ from: '2026-10-01', to: '2026-10-31' }"
  ></div>`,
})
class HostComponent {
  public readonly overview = signal<GroupOverview | null | undefined>(undefined);
  public readonly period = signal<ResolvedPeriod | undefined>({ from: "2026-10-01", to: "2026-10-31", label: "October 2026" });
  public readonly goal = signal(0);
  public readonly change = signal<string | undefined>(undefined);
  public readonly changeIsIncrease = signal(false);
}

const spent = (total: string): GroupOverview => ({ total, previousTotal: "100" }) as GroupOverview;

describe("OverviewSpentTileComponent", () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let tile: OverviewSpentTileComponent;
  let store: Store;
  let userPreferencesService: { updateUserPreferences: Mock };
  let snackbar: { error: Mock; success: Mock };

  const byId = (testId: string): HTMLElement | null => fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  const tileText = (): string => byId("overview-tile-spent")?.textContent?.replace(/\s+/g, " ").trim() ?? "";

  const allowEditing = async () => {
    store.dispatch(new SetPermissions([Permission.AppUserPreferencesUpdate], {}));
    await fixture.whenStable();
  };

  const click = async (testId: string) => {
    byId(testId)?.click();
    await fixture.whenStable();
  };

  const type = async (value: string): Promise<HTMLInputElement> => {
    const input = byId("overview-goal-input") as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event("input"));
    await fixture.whenStable();
    return input;
  };

  beforeEach(async () => {
    userPreferencesService = { updateUserPreferences: vi.fn((preferences: UserPreferences) => of(preferences)) };
    snackbar = { error: vi.fn(), success: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [HostComponent, StoreModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: UserPreferencesService, useValue: userPreferencesService },
        { provide: SnackbarService, useValue: snackbar },
      ],
    }).compileComponents();

    store = TestBed.inject(Store);
    store.dispatch(new SetUserPreferences({ userId: 1, quickScanDefaultGroupId: 4 } as UserPreferences));
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    await fixture.whenStable();
    tile = fixture.debugElement.query(By.directive(OverviewSpentTileComponent)).componentInstance;
  });

  it("is a tile that opens the receipts of the period, with a dash until the total has loaded", async () => {
    const link = byId("overview-tile-spent-link") as HTMLAnchorElement;

    expect(byId("overview-tile-spent")?.classList.contains("cv-tile")).toBe(true);
    expect(link.getAttribute("href")).toBe("/receipts/group/7?from=2026-10-01&to=2026-10-31");
    expect(tileText()).toContain("–");
    expect(tileText()).toContain("October 2026");

    host.overview.set(spent("92"));
    await fixture.whenStable();
    expect(tileText()).toContain("92");
  });

  it("shows the change against the period before while there is no goal, coloured by its direction", async () => {
    host.overview.set(spent("92"));
    host.change.set("8% less than September 2026");
    await fixture.whenStable();

    expect(tileText()).toContain("8% less than September 2026");
    expect(fixture.nativeElement.querySelector(".text-success-text")).not.toBeNull();
    expect(byId("overview-spent-progress")).toBeNull();

    host.changeIsIncrease.set(true);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector(".text-warning-text")).not.toBeNull();
  });

  it("shows the goal, a thin bar and what is left; and what is over once the goal is passed", async () => {
    host.overview.set(spent("92"));
    host.goal.set(100);
    await fixture.whenStable();

    expect(tile.spentGoal()).toEqual({ goal: 100, over: 0, remaining: 8 });
    expect(byId("overview-spent-goal")?.textContent).toContain("100");
    expect(byId("overview-spent-progress")?.getAttribute("aria-valuenow")).toBe("92");
    expect(byId("overview-spent-remaining")?.textContent).toContain("8");
    expect(byId("overview-spent-over")).toBeNull();

    host.goal.set(80);
    await fixture.whenStable();
    expect(tile.spentGoal()).toEqual({ goal: 80, over: 12, remaining: 0 });
    expect(tile.goalProgress()).toBe(100);
    expect(byId("overview-spent-over")?.textContent).toContain("12");
    expect(byId("overview-spent-remaining")).toBeNull();
  });

  it("leaves the goal out for anything but one whole calendar month", async () => {
    host.overview.set(spent("92"));
    host.goal.set(100);
    host.period.set({ from: "2026-10-05", to: "2026-10-11", label: "5 Oct 2026 – 11 Oct 2026" });
    await fixture.whenStable();

    expect(tile.spentGoal()).toBeUndefined();
    expect(byId("overview-spent-goal")).toBeNull();
    expect(byId("overview-spent-progress")).toBeNull();
  });

  describe("setting the goal from the tile", () => {
    it("offers nothing to someone who may not update their preferences", () => {
      expect(tile.canEditGoal()).toBe(false);
      expect(byId("overview-set-goal")).toBeNull();
      expect(byId("overview-goal-edit")).toBeNull();
    });

    it("offers + Set goal, opens the field with the keyboard in it, and saves on Enter with the other preferences kept", async () => {
      host.overview.set(spent("92"));
      await allowEditing();

      await click("overview-set-goal");
      const input = await type("1500,50");
      expect(tile.editingGoal()).toBe(true);
      expect(document.activeElement).toBe(input);

      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
      await fixture.whenStable();

      expect(userPreferencesService.updateUserPreferences).toHaveBeenCalledWith({ userId: 1, quickScanDefaultGroupId: 4, monthlySpendingGoal: "1500.50" });
      expect(store.selectSnapshot(AuthState.userPreferences)?.monthlySpendingGoal).toBe("1500.50");
      expect(snackbar.success).toHaveBeenCalledWith("Monthly goal saved");
      expect(tile.editingGoal()).toBe(false);
    });

    it("starts from the goal there is, and removes it when the field is emptied", async () => {
      store.dispatch(new SetUserPreferences({ userId: 1, monthlySpendingGoal: "1500.5" } as UserPreferences));
      host.overview.set(spent("92"));
      host.goal.set(1500.5);
      await allowEditing();

      await click("overview-goal-edit");
      expect((byId("overview-goal-input") as HTMLInputElement).value).toBe("1500,5");

      const input = await type("");
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
      await fixture.whenStable();

      expect(userPreferencesService.updateUserPreferences).toHaveBeenCalledWith({ userId: 1, monthlySpendingGoal: undefined });
      expect(snackbar.success).toHaveBeenCalledWith("Monthly goal removed");
    });

    it("refuses what is not an amount and keeps the field open", async () => {
      await allowEditing();
      await click("overview-set-goal");

      const input = await type("a lot");
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
      await fixture.whenStable();

      expect(snackbar.error).toHaveBeenCalledTimes(1);
      expect(userPreferencesService.updateUserPreferences).not.toHaveBeenCalled();
      expect(tile.editingGoal()).toBe(true);
    });

    it("saves nothing on Escape, nor when the goal was left as it was", async () => {
      store.dispatch(new SetUserPreferences({ userId: 1, monthlySpendingGoal: "100" } as UserPreferences));
      host.overview.set(spent("92"));
      host.goal.set(100);
      await allowEditing();

      await click("overview-spent-goal");
      const input = await type("250");
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      await fixture.whenStable();
      expect(tile.editingGoal()).toBe(false);

      await click("overview-spent-goal");
      (byId("overview-goal-input") as HTMLInputElement).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
      await fixture.whenStable();

      expect(userPreferencesService.updateUserPreferences).not.toHaveBeenCalled();
      expect(tile.editingGoal()).toBe(false);
    });

    it("can be saved again after a save the server refused", async () => {
      host.overview.set(spent("92"));
      await allowEditing();
      userPreferencesService.updateUserPreferences.mockImplementationOnce(() => throwError(() => new Error("refused")));

      tile.startEditingGoal();
      tile.goalDraft.set("200");
      tile.saveGoal();
      expect(snackbar.success).not.toHaveBeenCalled();

      tile.startEditingGoal();
      tile.goalDraft.set("300");
      tile.saveGoal();

      expect(userPreferencesService.updateUserPreferences).toHaveBeenCalledTimes(2);
      expect(snackbar.success).toHaveBeenCalledWith("Monthly goal saved");
    });
  });
});
