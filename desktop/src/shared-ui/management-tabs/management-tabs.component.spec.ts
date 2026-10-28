import { TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import { provideStore, Store } from "@ngxs/store";
import { SetPermissions } from "../../store";
import { AuthState } from "../../store/auth.state";
import { SharedUiModule } from "../shared-ui.module";
import {
  allowedManagementTabs,
  ManagementTabsComponent,
  managementTabForUrl,
} from "./management-tabs.component";

describe("ManagementTabsComponent", () => {
  const ALL = ["app.categories.read", "app.tags.read", "app.users.read", "app.groups.read"];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SharedUiModule],
      providers: [
        provideStore([AuthState]),
        provideRouter([
          { path: "categories", children: [] },
          { path: "tags", children: [] },
          { path: "users", children: [] },
          { path: "groups", children: [{ path: "**", children: [] }] },
        ]),
      ],
    });
  });

  const create = async (permissions: string[], url: string) => {
    TestBed.inject(Store).dispatch(new SetPermissions(permissions, {}));
    await TestBed.inject(Router).navigateByUrl(url);
    const fixture = TestBed.createComponent(ManagementTabsComponent);
    await fixture.whenStable();
    return fixture;
  };

  const tabIds = (fixture: { nativeElement: HTMLElement }) =>
    Array.from(fixture.nativeElement.querySelectorAll("[data-testid^='management-tab-']")).map((tab) =>
      tab.getAttribute("data-testid")
    );

  it("shows Categories, Tags, Users and Households in that order for an admin", async () => {
    const fixture = await create(ALL, "/categories");

    expect(tabIds(fixture)).toEqual([
      "management-tab-categories",
      "management-tab-tags",
      "management-tab-users",
      "management-tab-households",
    ]);
  });

  it("shows only the tabs the user may read", async () => {
    const fixture = await create(["app.categories.read", "app.tags.read"], "/tags");

    expect(tabIds(fixture)).toEqual(["management-tab-categories", "management-tab-tags"]);
  });

  it("marks the page's tab, also on a household's own pages", async () => {
    const fixture = await create(ALL, "/groups/5/details/view");

    expect(fixture.componentInstance.active()).toBe("households");
  });

  it("opens a tab's page when it is picked", async () => {
    const fixture = await create(ALL, "/categories");

    fixture.componentInstance.select("users");
    await fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe("/users");
    expect(fixture.componentInstance.active()).toBe("users");
  });

  it("knows which tab an address belongs to", () => {
    expect(managementTabForUrl("/tags?page=2")?.name).toBe("tags");
    expect(managementTabForUrl("/users/3/edit")?.name).toBe("users");
    expect(managementTabForUrl("/tagsomething")).toBeUndefined();
    expect(managementTabForUrl("/receipts")).toBeUndefined();
    expect(allowedManagementTabs([]).length).toBe(0);
  });
});
