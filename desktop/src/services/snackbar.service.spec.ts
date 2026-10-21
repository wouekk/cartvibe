import { TestBed } from "@angular/core/testing";
import { ToastService } from "../toast/toast.service";
import { SnackbarService } from "./snackbar.service";

describe("SnackbarService", () => {
  let service: SnackbarService;
  let toast: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SnackbarService);
    toast = TestBed.inject(ToastService);
    jest.useFakeTimers();
  });

  afterEach(() => jest.useRealTimers());

  it("should be created", () => {
    expect(service).toBeTruthy();
  });

  it("shows a success toast that closes by itself", () => {
    service.success("Saved");

    expect(toast.toasts().map((item) => [item.kind, item.message])).toEqual([["success", "Saved"]]);
    jest.advanceTimersByTime(3000);
    expect(toast.toasts()).toEqual([]);
  });

  it("keeps an info toast until it is dismissed", () => {
    service.info("Working");
    jest.advanceTimersByTime(60000);

    expect(toast.toasts().length).toBe(1);
  });

  it("replaces the toast on screen, so two messages never stack", () => {
    service.error("First");
    service.error("Second");

    expect(toast.toasts().map((item) => item.message)).toEqual(["Second"]);
  });
});
