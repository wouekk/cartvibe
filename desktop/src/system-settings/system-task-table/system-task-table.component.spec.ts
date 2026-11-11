import { TranslatePipe } from "../../i18n/translate.pipe";
import { provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { CUSTOM_ELEMENTS_SCHEMA } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { ActivatedRoute } from "@angular/router";
import { NgxsModule } from "@ngxs/store";
import { FilterOperation } from "../../open-api";
import { SharedUiModule } from "../../shared-ui/shared-ui.module";
import { UserState } from "../../store";
import { buildDefaultSystemTaskFilter, SystemTaskTableStore } from "../../store/system-task-table.store";
import { TableModule } from "../../table/table.module";

import { SystemTaskTableComponent } from "./system-task-table.component";

describe("SystemTaskTableComponent", () => {
  let component: SystemTaskTableComponent;
  let fixture: ComponentFixture<SystemTaskTableComponent>;
  let table: SystemTaskTableStore;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    imports: [TranslatePipe, SharedUiModule,
        AppIconComponent,
        NgxsModule.forRoot([UserState]),
        TableModule, SystemTaskTableComponent],
    providers: [{
            provide: ActivatedRoute,
            useValue: {
                snapshot: {
                    data: {
                        allReceiptProcessingSettings: []
                    }
                }
            }
        }, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
})
      .compileComponents();

    table = TestBed.inject(SystemTaskTableStore);

    fixture = TestBed.createComponent(SystemTaskTableComponent);
    component = fixture.componentInstance;
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("starts with no chips and an empty badge", () => {
    expect(component.filterChips()).toEqual([]);
    expect(component.numFiltersApplied()).toBe(0);
  });

  it("builds one chip per active condition off the stored filter", () => {
    table.setFilter({
      ...buildDefaultSystemTaskFilter(),
      type: { operation: FilterOperation.Contains, value: ["QUICK_SCAN"] },
    } as any);

    expect(component.filterChips().map((chip) => chip.key)).toEqual(["type"]);
    expect(component.numFiltersApplied()).toBe(1);
  });

  // Clearing a chip from page 7 must not leave the user on a page the narrowed
  // result set no longer has.
  it("clears a chip and resets to page one", () => {
    table.setPage(7);
    table.setFilter({
      ...buildDefaultSystemTaskFilter(),
      type: { operation: FilterOperation.Contains, value: ["QUICK_SCAN"] },
    } as any);

    const refresh = vi.spyOn(component, "refresh").mockImplementation(() => {});

    component.filterChipCleared("type");

    expect(table.filter()).toEqual(buildDefaultSystemTaskFilter());
    expect(table.page()).toBe(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(component.filterChips()).toEqual([]);
  });
});
