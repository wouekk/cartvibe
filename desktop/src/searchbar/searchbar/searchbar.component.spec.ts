import { TranslatePipe } from "../../i18n/translate.pipe";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { CUSTOM_ELEMENTS_SCHEMA } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import { Router } from "@angular/router";
import { of } from "rxjs";
import { ApiModule, SearchResult, SearchService } from "../../open-api";

import { SearchbarComponent } from "./searchbar.component";
import { provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";

describe("SearchbarComponent", () => {
  let component: SearchbarComponent;
  let fixture: ComponentFixture<SearchbarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    declarations: [SearchbarComponent],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    imports: [TranslatePipe, ApiModule,
        ReactiveFormsModule,
        NoopAnimationsModule],
    providers: [
        { provide: Router, useValue: { navigateByUrl: jest.fn().mockResolvedValue(true) } },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting()
    ]
}).compileComponents();

    fixture = TestBed.createComponent(SearchbarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("should attempt to navigate to result", () => {
    const spy = jest.spyOn(TestBed.inject(Router), "navigateByUrl");
    const result: SearchResult = {
      id: 1,
      groupId: 1,
      type: "Receipt",
      name: "Hello",
      date: "totally a date",
      createdAt: "totally a date",
    };

    component.navigateToResult(result);
    expect(spy).toHaveBeenCalledWith("/receipts/1/view");
  });

  it("should do nothing when there is an invalid type", () => {
    const spy = jest.spyOn(TestBed.inject(Router), "navigateByUrl");
    const result: SearchResult = {
      id: 1,
      groupId: 1,
      type: "Not a valid type",
      name: "Hello",
      date: "totally a date",
      createdAt: "totally a date",
    };

    component.navigateToResult(result);
    expect(spy).toHaveBeenCalledTimes(0);
  });

  it("should attempt to call the search service", () => {
    const spy = jest.spyOn(TestBed.inject(SearchService), "receiptSearch");
    spy.mockReturnValue(
      of([
        {
          id: 1,
          groupId: 1,
          type: "Not a valid type",
          name: "Hello",
          date: "totally a date",
          createdAt: "totally a date",
        },
      ] as any)
    );

    component.ngOnInit();
    component.searchFormControl.patchValue("new search");

    expect(spy).toHaveBeenCalledWith("new search");
    expect(component.results()).toEqual([
      {
        id: 1,
        groupId: 1,
        type: "Not a valid type",
        name: "Hello",
        date: "totally a date",
        createdAt: "totally a date",
      },
    ]);
  });

  describe("the keyboard shortcut", () => {
    const press = (init: KeyboardEventInit): KeyboardEvent => {
      const event = new KeyboardEvent("keydown", { cancelable: true, ...init });
      Object.defineProperty(event, "target", { value: document.body });
      component.handleShortcut(event);
      return event;
    };

    beforeEach(() => {
      document.body.innerHTML = '<app-searchbar><input id="s"></app-searchbar>';
    });

    it("focuses the search box on Ctrl K and on /", () => {
      const input = document.getElementById("s") as HTMLInputElement;

      press({ key: "k", ctrlKey: true });
      expect(document.activeElement).toBe(input);

      input.blur();
      press({ key: "/" });
      expect(document.activeElement).toBe(input);
    });

    it("leaves / alone while typing in a field", () => {
      const event = new KeyboardEvent("keydown", { key: "/", cancelable: true });
      const field = document.createElement("textarea");
      Object.defineProperty(event, "target", { value: field });
      component.handleShortcut(event);

      expect(event.defaultPrevented).toBe(false);
    });
  });
});
