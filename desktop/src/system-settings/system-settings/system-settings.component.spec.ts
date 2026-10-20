import { CUSTOM_ELEMENTS_SCHEMA, provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router } from "@angular/router";
import { NgxsModule, Store } from "@ngxs/store";
import { Permission } from "../../open-api";
import { SharedUiModule } from "../../shared-ui/shared-ui.module";
import { AuthState } from "../../store/auth.state";
import { SetPermissions } from "../../store/auth.state.actions";

import { SystemSettingsComponent } from "./system-settings.component";

describe("SystemSettingsComponent", () => {
  let component: SystemSettingsComponent;
  let fixture: ComponentFixture<SystemSettingsComponent>;
  let store: Store;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [SystemSettingsComponent],
      imports: [SharedUiModule, NgxsModule.forRoot([AuthState])],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParams: {
                tab: "settings",
              },
            }
          }
        }
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    })
      .compileComponents();

    store = TestBed.inject(Store);
    fixture = TestBed.createComponent(SystemSettingsComponent);
    component = fixture.componentInstance;
  });

  it("should create", () => {
    store.dispatch(
      new SetPermissions([Permission.AppSystemEmailsRead], {})
    );
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it("shows no tab to a user who cannot read the settings, and never Prompts (Phase 3 M1)", () => {
    store.dispatch(
      new SetPermissions(
        [Permission.AppPromptsRead, Permission.AppSystemTasksRead],
        {}
      )
    );

    fixture.detectChanges();

    expect(component.tabs).toEqual([]);
  });

  it("shows the five tabs, in order, when the user can read the settings", () => {
    store.dispatch(new SetPermissions([Permission.AppSystemSettingsRead], {}));

    fixture.detectChanges();

    expect(component.tabs.map((tab) => tab.name)).toEqual(["general", "security", "integrations", "tasks", "logs"]);
    expect(component.filterTabs.map((tab) => tab.label)).toEqual([
      "General & Currency",
      "Auth & Security",
      "Integrations & Mobile",
      "Tasks & Storage",
      "Logs",
    ]);
  });

  it("opens a tab's route when it is picked", () => {
    store.dispatch(new SetPermissions([Permission.AppSystemSettingsRead], {}));
    fixture.detectChanges();
    const navigate = jest.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);

    component.select("tasks");

    expect(navigate).toHaveBeenCalledWith(["/system-settings", "tasks"]);
  });
});
