import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute } from "@angular/router";
import { ButtonModule } from "../../button";
import { AddButtonComponent } from "./add-button.component";

describe("AddButtonComponent", () => {
  let component: AddButtonComponent;
  let fixture: ComponentFixture<AddButtonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AddButtonComponent],
      imports: [ButtonModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ActivatedRoute, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AddButtonComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("renders an icon-only button when no buttonText is provided", async () => {
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector("button")?.classList).toContain("size-10");
    expect(el.querySelector("button span.font-semibold")).toBeFalsy();
  });

  it("renders a labeled raised button when buttonText is provided", async () => {
    fixture.componentRef.setInput("buttonText", "Add Thing");
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector("button span.font-semibold")).toBeTruthy();
    expect(el.querySelector("button")?.classList).not.toContain("size-10");
    expect(el.textContent).toContain("Add Thing");
  });
});
