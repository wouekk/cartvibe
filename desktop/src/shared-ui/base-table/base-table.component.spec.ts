import { TranslatePipe } from "../../i18n/translate.pipe";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NgxsModule } from "@ngxs/store";
import { Subject } from "rxjs";
import { BaseTableService } from "../../services/base-table.service";

import { BaseTableComponent } from "./base-table.component";

describe("BaseTableComponent", () => {
  let component: BaseTableComponent<any>;
  let fixture: ComponentFixture<BaseTableComponent<any>>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    imports: [TranslatePipe, NgxsModule.forRoot([]), BaseTableComponent],
    providers: [
        {
            provide: BaseTableService,
            useValue: {}
        }
    ]
})
      .compileComponents();

    fixture = TestBed.createComponent(BaseTableComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("lets the newest page request win over a slower earlier one", () => {
    const slow = new Subject<any>();
    const fast = new Subject<any>();
    const getPagedData = vi.fn().mockReturnValueOnce(slow).mockReturnValueOnce(fast);
    (component.baseTableService as any).getPagedData = getPagedData;

    component.getTableData();
    component.getTableData();

    fast.next({ data: [{ id: 2 }], totalCount: 1 });
    slow.next({ data: [{ id: 1 }, { id: 2 }], totalCount: 2 });

    expect(component.totalCount()).toBe(1);
    expect(component.dataSource().data).toEqual([{ id: 2 }]);
  });
});
