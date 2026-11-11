import { TranslatePipe } from "../../i18n/translate.pipe";
import { CUSTOM_ELEMENTS_SCHEMA } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router } from "@angular/router";

import { TabsComponent } from "./tabs.component";

describe("TabsComponent", () => {
  let component: TabsComponent;
  let fixture: ComponentFixture<TabsComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslatePipe],
      declarations: [TabsComponent],
            providers: [{
        provide: ActivatedRoute,
        useValue: {}
      }],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    });
    fixture = TestBed.createComponent(TabsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("stays quiet when its tabs are taken away (signing out removes them while the page is still up)", () => {
    (TestBed.inject(ActivatedRoute) as any).snapshot = { queryParams: {} };
    fixture.componentRef.setInput("tabs", [{ label: "Theme", name: "theme", routerLink: "theme" }]);
    fixture.detectChanges();
    expect(component.activeName()).toBe("theme");

    fixture.componentRef.setInput("tabs", []);

    expect(() => fixture.detectChanges()).not.toThrow();
    expect(component.activeName()).toBe("");
  });

  it("navigates to a tab's link relative to the page that hosts the tabs", () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, "navigate").mockResolvedValue(true);
    fixture.componentRef.setInput("tabs", [{ label: "Theme", name: "theme", routerLink: "theme" }]);

    component.activate("theme");

    expect(navigate).toHaveBeenCalledWith(["theme"], {
      relativeTo: TestBed.inject(ActivatedRoute),
      queryParams: { tab: "theme" },
    });
  });
});
