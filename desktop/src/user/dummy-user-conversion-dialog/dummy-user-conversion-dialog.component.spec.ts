import { provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { CUSTOM_ELEMENTS_SCHEMA } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { AppDialogRef } from "../../dialog/app-dialog";
import { of } from "rxjs";
import { ApiModule, UserService } from "../../open-api";
import { SnackbarService } from "../../services";
import { UserStore } from "../../store";
import { DummyUserConversionDialogComponent } from "./dummy-user-conversion-dialog.component";

describe("DummyUserConversionDialogComponent", () => {
  let component: DummyUserConversionDialogComponent;
  let fixture: ComponentFixture<DummyUserConversionDialogComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    imports: [
        ApiModule,
                DummyUserConversionDialogComponent,
    ],
    providers: [
        SnackbarService,
        {
            provide: AppDialogRef,
            useValue: {
                close: () => { },
            },
        },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
    ]
});
    fixture = TestBed.createComponent(DummyUserConversionDialogComponent);
    component = fixture.componentInstance;
    component.user = {} as any;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("should init form correctly", () => {
    component.ngOnInit();

    expect(component.form.value).toEqual({
      password: "",
    });
  });

  it("should call close when cancel button is clicked", () => {
    const dialogRefSpy = vi.spyOn(component.dialogRef, "close");
    component.cancelButtonClicked();

    expect(dialogRefSpy).toHaveBeenCalledTimes(1);
  });

  it("should call service and call update in state", () => {
    const usersService = TestBed.inject(UserService);

    const usersSpy = vi.spyOn(usersService, "convertDummyUserById");
    usersSpy.mockReturnValue(of(undefined as any));

    const updateUser = vi.spyOn(TestBed.inject(UserStore), "updateUser");

    const dialogSpy = vi.spyOn(component.dialogRef, "close");
    dialogSpy.mockReturnValue(undefined);

    vi.spyOn(TestBed.inject(SnackbarService), "success").mockReturnValue(
      undefined
    );

    component.user = {
      id: 1,
    } as any;

    component.ngOnInit();

    component.form.patchValue({
      password: "hello world",
    });

    component.submitButtonClicked();

    expect(usersSpy).toHaveBeenCalledWith(
      1,
      {
        password: "hello world",
      },
    );
    expect(updateUser).toHaveBeenCalledWith("1", { id: 1, isDummyUser: false });
    expect(dialogSpy).toHaveBeenCalledWith(true);
  });
});
