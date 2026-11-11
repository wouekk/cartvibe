import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { NgxsModule, Store } from "@ngxs/store";
import { of, throwError } from "rxjs";
import { AppDialog } from "../../dialog/app-dialog";
import { User, UserService } from "../../open-api";
import { SnackbarService } from "../../services/snackbar.service";
import { AuthStore } from "../../store";
import { UserStore } from "../../store/user.store";
import { AvatarPhotoComponent } from "./avatar-photo.component";
import { seedStore } from "../../testing/seed-store";

describe("AvatarPhotoComponent", () => {
  let fixture: ComponentFixture<AvatarPhotoComponent>;
  let store: Store;
  let uploadAvatar: ReturnType<typeof vi.fn>;
  let deleteAvatar: ReturnType<typeof vi.fn>;
  let error: ReturnType<typeof vi.fn>;
  let confirmation: Record<string, string>;

  beforeEach(async () => {
    uploadAvatar = vi.fn(() => of({ avatarUpdatedAt: "2026-11-04T10:00:00Z" }));
    deleteAvatar = vi.fn(() => of({ avatarUpdatedAt: null }));
    error = vi.fn();
    confirmation = {};

    await TestBed.configureTestingModule({
      imports: [AvatarPhotoComponent, NgxsModule.forRoot([])],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: UserService, useValue: { uploadAvatar, deleteAvatar } },
        { provide: SnackbarService, useValue: { success: vi.fn(), error } },
        {
          provide: AppDialog,
          useValue: { open: vi.fn(() => ({ afterClosed: () => of(true), componentInstance: confirmation })) },
        },
      ],
    }).compileComponents();

    store = TestBed.inject(Store);
    seedStore(TestBed.inject(AuthStore), { ...store.snapshot().auth, userId: "7", displayname: "Sam" });
    TestBed.inject(UserStore).setUsers([{ id: 7, displayName: "Sam", username: "sam" } as User]);
    TestBed.inject(AuthStore).setPermissions(["app.account.update"], {});
    fixture = TestBed.createComponent(AvatarPhotoComponent);
    await fixture.whenStable();
  });

  const byTestId = (id: string): HTMLElement | null => fixture.nativeElement.querySelector(`[data-testid="${id}"]`);
  const pick = async (input: HTMLInputElement, file: File) => {
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(fixture.componentInstance.saving()).toBe(false));
    await fixture.whenStable();
  };
  const myAvatarUpdatedAt = () => TestBed.inject(UserStore).users().find((user) => user.id === 7)?.avatarUpdatedAt;

  it("offers a camera and a file picker as native inputs inside labels", () => {
    const camera = byTestId("avatar-take-photo") as HTMLInputElement;
    const file = byTestId("avatar-choose-file") as HTMLInputElement;

    expect(camera.type).toBe("file");
    expect(camera.getAttribute("capture")).toBe("user");
    expect(camera.closest("label")).not.toBeNull();
    expect(file.closest("label")).not.toBeNull();
    expect(byTestId("avatar-remove")).toBeNull();
  });

  it("uploads a picked photo and shows it everywhere through the user list", async () => {
    await pick(byTestId("avatar-choose-file") as HTMLInputElement, new File([new Uint8Array(10)], "me.png", { type: "image/png" }));

    expect(uploadAvatar).toHaveBeenCalledTimes(1);
    expect(myAvatarUpdatedAt()).toBe("2026-11-04T10:00:00Z");
    expect(byTestId("avatar-remove")).not.toBeNull();
  });

  it("refuses a file over 8 MB without uploading it", async () => {
    const huge = new File([new Uint8Array(9 * 1024 * 1024)], "huge.gif", { type: "image/gif" });

    await pick(byTestId("avatar-choose-file") as HTMLInputElement, huge);

    expect(uploadAvatar).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });

  it("removes the photo after a red Remove confirmation", async () => {
    TestBed.inject(UserStore).setUsers([{ id: 7, displayName: "Sam", username: "sam", avatarUpdatedAt: "2026-11-01T00:00:00Z" } as User]);
    await fixture.whenStable();

    (byTestId("avatar-remove") as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(confirmation["confirmText"]).toBe("Remove");
    expect(deleteAvatar).toHaveBeenCalledTimes(1);
    expect(myAvatarUpdatedAt()).toBeUndefined();
  });

  it("lets the person try again after a failed upload", async () => {
    uploadAvatar.mockReturnValue(throwError(() => new Error("offline")));

    await pick(byTestId("avatar-choose-file") as HTMLInputElement, new File([new Uint8Array(10)], "me.png", { type: "image/png" }));

    expect(fixture.componentInstance.saving()).toBe(false);
    expect(myAvatarUpdatedAt()).toBeUndefined();
  });

  it("hides the photo buttons without app.account.update", async () => {
    TestBed.inject(AuthStore).setPermissions([], {});
    await fixture.whenStable();

    expect(byTestId("avatar-take-photo")).toBeNull();
  });
});
