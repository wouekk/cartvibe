import { NO_ERRORS_SCHEMA, provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { AppDialogRef } from "../../dialog/app-dialog";
import { NgxsModule, Store } from "@ngxs/store";
import { ShoppingListService } from "../../open-api";
import { PipesModule } from "../../pipes/pipes.module";
import { SystemSettingsState } from "../../store/system-settings.state";
import { ShoppingListFormDialogComponent } from "./shopping-list-form-dialog.component";

describe("ShoppingListFormDialogComponent", () => {
  let component: ShoppingListFormDialogComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ShoppingListFormDialogComponent],
      imports: [NgxsModule.forRoot([SystemSettingsState]), PipesModule, ReactiveFormsModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: AppDialogRef, useValue: { close: vi.fn() } },
        { provide: ShoppingListService, useValue: {} },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    const store = TestBed.inject(Store);
    store.reset({ ...store.snapshot(), systemSettings: { timeZone: "Europe/Amsterdam" } });
    component = TestBed.createComponent(ShoppingListFormDialogComponent).componentInstance;
  });

  afterEach(() => vi.useRealTimers());

  it("names a new list after the app zone's today (Phase 3 S3)", () => {
    vi.useFakeTimers();
    // 23:30 UTC is already the next day in Amsterdam.
    vi.setSystemTime(new Date("2026-10-20T23:30:00Z"));

    component.ngOnInit();

    expect(component.form.value.name).toBe("List 21 Oct 2026");
  });

  it("keeps a list's own name when renaming it", () => {
    component.list = { id: 1, groupId: 1, name: "Pharmacy", items: [] };

    component.ngOnInit();

    expect(component.form.value.name).toBe("Pharmacy");
  });
});
