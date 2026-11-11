import { TranslatePipe } from "../../i18n/translate.pipe";
import { provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { AppDialog } from "../../dialog/app-dialog";
import { TableDataSource } from "../../table/table-types";
import { By } from "@angular/platform-browser";
import { provideRouter, Router, RouterLink } from "@angular/router";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmDropdownMenuImports } from "@spartan-ng/helm/dropdown-menu";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { ViewportService } from "../../services/viewport.service";
import { AvatarModule } from "../../avatar";
import { RowActionsComponent } from "../../shared-ui/row-actions/row-actions.component";
import { NgxsModule, Store } from "@ngxs/store";
import { of } from "rxjs";
import { SharedUiModule } from "src/shared-ui/shared-ui.module";
import { TableModule } from "src/table/table.module";
import { ButtonModule } from "../../button";
import { ApiModule, Group, GroupsService, Permission } from "../../open-api";
import { AuthState, GroupState, SetGroups } from "../../store";
import { SetPermissions } from "../../store/auth.state.actions";
import { GroupTableState } from "../../store/group-table.state";
import { SystemSettingsState } from "../../store/system-settings.state";
import { AppDatePipe } from "../../pipes/app-date.pipe";

import { GroupTableComponent } from "./group-table.component";

describe("GroupTableComponent", () => {
  let component: GroupTableComponent;
  let fixture: ComponentFixture<GroupTableComponent>;
  let store: Store;

  const queryTestId = (id: string) =>
    fixture.debugElement.query(By.css(`[data-testid="${id}"]`));

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    imports: [TranslatePipe,
        RouterLink,
        ApiModule,
        ButtonModule,
        AppDatePipe,
        NgxsModule.forRoot([AuthState, GroupState, GroupTableState, SystemSettingsState]),
        SharedUiModule,
        TableModule,
        HlmButton,
        ...HlmDropdownMenuImports,
        AppIconComponent,
        AvatarModule,
        RowActionsComponent, GroupTableComponent,],
    providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
    ],
}).compileComponents();

    store = TestBed.inject(Store);
    fixture = TestBed.createComponent(GroupTableComponent);
    component = fixture.componentInstance;
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  // This component sets `displayedColumns` in ngAfterViewInit, which trips
  // checkNoChanges (NG0100) during a whenStable() app-tick. The FAB gating we
  // assert here only depends on the *hasAppPermission directive's effect, so we
  // drive change detection with detectChanges(false) to skip the verification
  // pass rather than restructure the unrelated table column wiring.
  it("shows the Create Group FAB with the app group-create permission", () => {
    store.dispatch(new SetPermissions([Permission.AppGroupsCreate], {}));
    fixture.detectChanges(false);

    expect(queryTestId("group-create")).toBeTruthy();
  });

  it("hides the Create Group FAB without the app group-create permission", () => {
    store.dispatch(new SetPermissions([], {}));
    fixture.detectChanges(false);

    expect(queryTestId("group-create")).toBeFalsy();
  });

  describe("delete row action", () => {
    // Row actions only exist once the table has columns (wired in
    // ngAfterViewInit, so it needs one CD pass first) AND a row. Group 5 stands
    // in for a group the caller is NOT a member of — the all-groups admin view.
    const renderRowWith = (
      appPermissions: string[],
      groupPermissions: { [groupId: number]: string[] } = {}
    ) => {
      fixture.detectChanges(false);
      component.dataSource.set(
        new TableDataSource([
          { id: 5, name: "Abandoned Group", groupMembers: [] } as unknown as Group,
        ])
      );
      store.dispatch(new SetPermissions(appPermissions, groupPermissions));
      fixture.detectChanges(false);
      TestBed.flushEffects();
      fixture.detectChanges(false);
    };

    const group = { id: 5, name: "Abandoned Group", groupMembers: [] } as unknown as Group;

    it("offers delete to a member holding group.delete", () => {
      renderRowWith([], { 5: [Permission.GroupDelete] });

      expect(queryTestId("group-delete")).toBeTruthy();
      expect(component.canDelete(group)).toBe(true);
      expect(component.canEdit(group)).toBe(false);
    });

    it("offers delete to a non-member holding app.groups.delete", () => {
      renderRowWith([Permission.AppGroupsDelete]);

      expect(queryTestId("group-delete")).toBeTruthy();
      expect(component.canDelete(group)).toBe(true);
    });

    it("shows no row action to a non-member who can only read all groups", () => {
      renderRowWith([Permission.AppGroupsRead]);

      expect(queryTestId("group-delete")).toBeFalsy();
      expect(queryTestId("group-edit")).toBeFalsy();
    });
  });

  describe("edit row action", () => {
    const group = { id: 5, name: "Home", groupMembers: [] } as unknown as Group;

    it("offers Edit to a member holding group.update and opens the household's edit page", () => {
      store.dispatch(new SetPermissions([], { 5: [Permission.GroupUpdate] }));
      const navigate = vi.spyOn(TestBed.inject(Router), "navigateByUrl").mockResolvedValue(true);

      expect(component.canEdit(group)).toBe(true);
      component.editGroup(group);

      expect(navigate).toHaveBeenCalledWith("/groups/5/details/edit");
    });

    it("offers Edit to an app admin who only joined the household as a Member", () => {
      store.dispatch(new SetPermissions([Permission.AppGroupsUpdate], { 5: [Permission.GroupView] }));

      expect(component.canEdit(group)).toBe(true);
    });

    it("offers no Edit to a Member without the app permission", () => {
      store.dispatch(new SetPermissions([], { 5: [Permission.GroupView] }));

      expect(component.canEdit(group)).toBe(false);
    });

    it("never offers Edit or Delete on the synthetic All group", () => {
      store.dispatch(new SetPermissions([Permission.AppGroupsDelete], { 5: [Permission.GroupUpdate, Permission.GroupDelete] }));
      const all = { ...group, isAllGroup: true } as Group;

      expect(component.canEdit(all)).toBe(false);
      expect(component.canDelete(all)).toBe(false);
    });

    it("drops the dates and the member count on a phone so the row menu stays on screen", () => {
      const viewport = TestBed.inject(ViewportService) as unknown as { isHandset: () => boolean };
      Object.defineProperty(viewport, "isHandset", { value: () => true });
      fixture = TestBed.createComponent(GroupTableComponent);

      expect(fixture.componentInstance.visibleColumns()).toEqual(["name", "actions"]);
    });
  });

  describe("deleteDisabled", () => {
    // Mirrors the backend CanDeleteGroup rule. GroupState.groups holds the
    // CALLER's own groups (including the virtual "All" group), so without the
    // permission escape a one-group admin is blocked from deleting anything.
    it("disables delete for a caller with a single group and no app permission", () => {
      store.dispatch(new SetGroups([{ id: 1 } as Group]));
      store.dispatch(new SetPermissions([], {}));

      expect(component.deleteDisabled()).toBe(true);
    });

    it("does not disable delete for an app.groups.delete holder with a single group", () => {
      store.dispatch(new SetGroups([{ id: 1 } as Group]));
      store.dispatch(new SetPermissions([Permission.AppGroupsDelete], {}));

      expect(component.deleteDisabled()).toBe(false);
    });

    it("does not disable delete for a caller with more than one group", () => {
      store.dispatch(new SetGroups([{ id: 1 } as Group, { id: 2 } as Group]));
      store.dispatch(new SetPermissions([], {}));

      expect(component.deleteDisabled()).toBe(false);
    });
  });

  describe("deleteGroup", () => {
    it("refetches the current page instead of swapping in the caller's own groups", () => {
      // The table is server-paged and may be showing the all-groups filter, so
      // the post-delete refresh has to go back to the server.
      const deleteSpy = vi
        .spyOn(TestBed.inject(GroupsService), "deleteGroup")
        .mockReturnValue(of({} as any));
      const refetchSpy = vi
        .spyOn(component, "getTableData")
        .mockImplementation(() => {});
      vi
        .spyOn(TestBed.inject(AppDialog), "open")
        .mockReturnValue({ afterClosed: () => of(true), componentInstance: {} } as any);

      store.dispatch(new SetGroups([{ id: 1 } as Group, { id: 2 } as Group]));
      component.dataSource.set(
        new TableDataSource([{ id: 5, name: "Abandoned Group" } as Group])
      );

      component.deleteGroup(0);

      expect(deleteSpy).toHaveBeenCalledWith(5);
      expect(refetchSpy).toHaveBeenCalled();
    });

    it("does nothing when deletion is disabled", () => {
      const deleteSpy = vi.spyOn(TestBed.inject(GroupsService), "deleteGroup");
      const dialogSpy = vi.spyOn(TestBed.inject(AppDialog), "open");

      store.dispatch(new SetGroups([{ id: 1 } as Group]));
      store.dispatch(new SetPermissions([], {}));
      component.dataSource.set(
        new TableDataSource([{ id: 1, name: "Only Group" } as Group])
      );

      component.deleteGroup(0);

      expect(dialogSpy).not.toHaveBeenCalled();
      expect(deleteSpy).not.toHaveBeenCalled();
    });
  });
});
