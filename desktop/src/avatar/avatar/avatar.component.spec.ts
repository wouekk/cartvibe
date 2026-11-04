import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NgxsModule, Store } from "@ngxs/store";
import { HlmTooltipImports } from "@spartan-ng/helm/tooltip";
import { User } from "../../open-api";
import { SetUsers } from "../../store/user.state.actions";
import { UserState } from "../../store/user.state";
import { AvatarComponent } from "./avatar.component";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { Group } from "../../open-api";

describe("AvatarComponent", () => {
  let fixture: ComponentFixture<AvatarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AvatarComponent],
      imports: [...HlmTooltipImports, AppIconComponent, NgxsModule.forRoot([UserState])],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(AvatarComponent);
  });

  const photo = (): HTMLImageElement | null => fixture.nativeElement.querySelector('[data-testid="avatar-photo"]');

  it("shows the initial without a photo", async () => {
    fixture.componentRef.setInput("user", { id: 1, displayName: "alex" } as User);
    await fixture.whenStable();

    expect(photo()).toBeNull();
    expect(fixture.nativeElement.textContent.trim()).toBe("A");
  });

  it("shows the photo, versioned by when it was saved", async () => {
    fixture.componentRef.setInput("user", { id: 1, displayName: "Alex", avatarUpdatedAt: "2026-11-04T10:00:00Z" } as User);
    await fixture.whenStable();

    expect(photo()?.getAttribute("src")).toBe("/api/user/1/avatar?v=2026-11-04T10%3A00%3A00Z");
  });

  it("finds the signed-in user's photo in the household's user list", async () => {
    TestBed.inject(Store).dispatch(new SetUsers([{ id: 7, displayName: "Sam", avatarUpdatedAt: "2026-11-01T08:00:00Z" } as User]));
    fixture.componentRef.setInput("user", { id: 7, displayName: "Sam" } as User);
    await fixture.whenStable();

    expect(photo()?.getAttribute("src")).toContain("/api/user/7/avatar?v=");
  });

  it("falls back to the initial when the photo does not load", async () => {
    fixture.componentRef.setInput("user", { id: 1, displayName: "Alex", avatarUpdatedAt: "2026-11-04T10:00:00Z" } as User);
    await fixture.whenStable();

    photo()!.dispatchEvent(new Event("error"));
    await fixture.whenStable();

    expect(photo()).toBeNull();
    expect(fixture.nativeElement.textContent.trim()).toBe("A");
  });

  const circle = (): HTMLElement => fixture.nativeElement.querySelector(".avatar");
  const groupIcon = () => fixture.nativeElement.querySelector('[data-testid="avatar-group-icon"]');

  it("draws a household's icon on its colour", async () => {
    fixture.componentRef.setInput("group", { id: 2, name: "Home", icon: "dog", color: "teal" } as Group);
    await fixture.whenStable();

    expect(groupIcon()).not.toBeNull();
    expect(circle().style.backgroundColor).toBe("var(--household-teal)");
  });

  it("keeps a household's initial on the primary colour without a look", async () => {
    fixture.componentRef.setInput("group", { id: 2, name: "home", icon: "", color: "" } as Group);
    await fixture.whenStable();

    expect(groupIcon()).toBeNull();
    expect(fixture.nativeElement.textContent.trim()).toBe("H");
    expect(circle().classList).toContain("bg-primary");
  });

  it("ignores an icon or colour it does not know", async () => {
    fixture.componentRef.setInput("group", { id: 2, name: "Home", icon: "rocket", color: "#f00" } as Group);
    await fixture.whenStable();

    expect(groupIcon()).toBeNull();
    expect(circle().style.backgroundColor).toBe("");
  });
});
