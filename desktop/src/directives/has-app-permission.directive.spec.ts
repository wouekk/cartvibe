import { Component, provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { AuthStore } from "../store/auth.store";
import { HasAppPermissionDirective } from "./has-app-permission.directive";

@Component({ template: `<span *hasAppPermission="permission" data-testid="gated">gated</span>`, imports: [HasAppPermissionDirective] })
class HostComponent {
  permission = "app.users.read";
}

describe("HasAppPermissionDirective", () => {
  let fixture: ComponentFixture<HostComponent>;

  const gated = () => fixture.nativeElement.querySelector("[data-testid='gated']");

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    imports: [HostComponent, HasAppPermissionDirective],
    providers: [provideZonelessChangeDetection()],
}).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
  });

  it("renders the template when the permission is granted", async () => {
    TestBed.inject(AuthStore).setPermissions(["app.users.read"], {});
    await fixture.whenStable();

    expect(gated()).toBeTruthy();
  });

  it("does not render when the permission is not granted", async () => {
    TestBed.inject(AuthStore).setPermissions(["app.roles.read"], {});
    await fixture.whenStable();

    expect(gated()).toBeFalsy();
  });

  it("re-renders when permissions are dispatched after the initial render", async () => {
    // Initial paint with no permissions → hidden.
    await fixture.whenStable();
    expect(gated()).toBeFalsy();

    // Permissions arrive late (e.g. AppData lands post-login).
    TestBed.inject(AuthStore).setPermissions(["app.users.read"], {});
    TestBed.flushEffects();
    await fixture.whenStable();

    expect(gated()).toBeTruthy();
  });

  it("honors wildcard grants", async () => {
    TestBed.inject(AuthStore).setPermissions(["*"], {});
    await fixture.whenStable();

    expect(gated()).toBeTruthy();
  });
});
