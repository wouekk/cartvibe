import { Component, provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NgxsModule, Store } from "@ngxs/store";
import { AuthStore } from "../store/auth.store";
import { HasGroupPermissionDirective, HasGroupPermissionInput } from "./has-group-permission.directive";

@Component({ template: `<span *hasGroupPermission="config" data-testid="gated">gated</span>`, imports: [HasGroupPermissionDirective] })
class HostComponent {
  config: HasGroupPermissionInput = { groupId: 1, permission: "group.view" };
}

describe("HasGroupPermissionDirective", () => {
  let fixture: ComponentFixture<HostComponent>;
  let store: Store;
  let host: HostComponent;

  const gated = () => fixture.nativeElement.querySelector("[data-testid='gated']");

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    imports: [NgxsModule.forRoot([]), HostComponent, HasGroupPermissionDirective],
    providers: [provideZonelessChangeDetection()],
}).compileComponents();

    store = TestBed.inject(Store);
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
  });

  it("renders when the group permission is granted", async () => {
    TestBed.inject(AuthStore).setPermissions([], { 1: ["group.view"] });
    await fixture.whenStable();

    expect(gated()).toBeTruthy();
  });

  it("does not render when the group permission is not granted", async () => {
    TestBed.inject(AuthStore).setPermissions([], { 1: ["group.receipts.read"] });
    await fixture.whenStable();

    expect(gated()).toBeFalsy();
  });

  it("does not render for a group the user is not a member of", async () => {
    host.config = { groupId: 2, permission: "group.view" };
    TestBed.inject(AuthStore).setPermissions([], { 1: ["group.view"] });
    await fixture.whenStable();

    expect(gated()).toBeFalsy();
  });

  it("renders via the orApp override for a non-member holding the app permission", async () => {
    host.config = { groupId: 2, permission: "group.view", orApp: ["app.groups.read"] };
    TestBed.inject(AuthStore).setPermissions(["app.groups.read"], { 1: ["group.view"] });
    await fixture.whenStable();

    expect(gated()).toBeTruthy();
  });

  it("re-renders when permissions are dispatched after the initial render", async () => {
    await fixture.whenStable();
    expect(gated()).toBeFalsy();

    TestBed.inject(AuthStore).setPermissions([], { 1: ["group.view"] });
    TestBed.flushEffects();
    await fixture.whenStable();

    expect(gated()).toBeTruthy();
  });
});
