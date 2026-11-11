import { CUSTOM_ELEMENTS_SCHEMA } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { Permission } from "../../open-api";
import { GroupTabsComponent } from "./group-tabs.component";
import { seedStore } from "../../testing/seed-store";
import { FeatureConfigStore } from "../../store/feature-config.store";
import { AuthStore } from "../../store/auth.store";

describe("GroupTabsComponent", () => {
  let component: GroupTabsComponent;
  let fixture: ComponentFixture<GroupTabsComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [ReactiveFormsModule,GroupTabsComponent],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
});
    fixture = TestBed.createComponent(GroupTabsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("should init tabs without group settings", () => {
    component.ngOnInit();

    expect(component.tabs).toEqual([
      {
        label: "Group Details",
        routerLink: "details/view",
        name: "details"
      },
      {
        label: "Group Receipt Settings",
        routerLink: "receipt-settings/view",
        name: "receipt-settings",
      },
    ]);
  });

  it("offers no Group AI Settings tab, even with the AI feature and the permission (AI is household-wide)", () => {
    seedStore(TestBed.inject(AuthStore), {
      appPermissions: [Permission.AppGroupsRead],
    });
    seedStore(TestBed.inject(FeatureConfigStore), {
      aiPoweredReceipts: true,
    });
    component.ngOnInit();

    expect(component.tabs).toEqual([
      {
        label: "Group Details",
        routerLink: "details/view",
        name: "details"
      },
      {
        label: "Group Receipt Settings",
        routerLink: "receipt-settings/view",
        name: "receipt-settings",
      },
    ]);
  });

  it("does not init the group settings tab without the update-settings permission", () => {
    seedStore(TestBed.inject(AuthStore), {
      appPermissions: [],
    });
    seedStore(TestBed.inject(FeatureConfigStore), {
      aiPoweredReceipts: true,
    });
    component.ngOnInit();

    expect(component.tabs).toEqual([
      {
        label: "Group Details",
        routerLink: "details/view",
        name: "details"
      },
      {
        label: "Group Receipt Settings",
        routerLink: "receipt-settings/view",
        name: "receipt-settings",
      },
    ]);
  });
});
