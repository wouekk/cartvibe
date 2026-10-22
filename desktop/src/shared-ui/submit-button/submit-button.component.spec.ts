import { Component, provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { NgxsModule } from "@ngxs/store";
import { FormMode } from "src/enums/form-mode.enum";
import { LayoutState } from "src/store/layout.state";
import { ButtonModule } from "../../button";
import { SubmitButtonComponent } from "./submit-button.component";

@Component({
  template: `
    <form [formGroup]="form">
      <input formControlName="name" />
      <app-submit-button [mode]="mode()"></app-submit-button>
    </form>
  `,
  standalone: false,
})
class HostComponent {
  public readonly form = new FormGroup({ name: new FormControl("Milk") });
  public readonly mode = signal<FormMode>(FormMode.edit);
}

describe("SubmitButtonComponent", () => {
  let component: SubmitButtonComponent;
  let fixture: ComponentFixture<SubmitButtonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [SubmitButtonComponent, HostComponent],
      imports: [ButtonModule, ReactiveFormsModule, NgxsModule.forRoot([LayoutState])],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: ActivatedRoute,
          useValue: {},
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SubmitButtonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("is a labelled Save button by default, not a bare check mark", async () => {
    await fixture.whenStable();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector("button");
    expect(button.textContent).toContain("Save");
  });

  describe("inside a form", () => {
    let host: ComponentFixture<HostComponent>;

    const saveButton = (): HTMLButtonElement => host.nativeElement.querySelector("app-submit-button button");

    beforeEach(async () => {
      host = TestBed.createComponent(HostComponent);
      host.detectChanges();
      await host.whenStable();
    });

    it("is dimmed in edit mode while the form is unchanged, and lights up on a change", async () => {
      expect(saveButton().disabled).toBe(true);

      host.componentInstance.form.get("name")!.setValue("Bread");
      host.componentInstance.form.markAsDirty();
      host.detectChanges();
      await host.whenStable();
      expect(saveButton().disabled).toBe(false);

      // Saved: the form settles and Save dims again.
      host.componentInstance.form.markAsPristine();
      host.detectChanges();
      await host.whenStable();
      expect(saveButton().disabled).toBe(true);
    });

    it("stays usable in add mode, where a prefilled form may be submitted as it is", async () => {
      host.componentInstance.mode.set(FormMode.add);
      host.detectChanges();
      await host.whenStable();
      expect(saveButton().disabled).toBe(false);
    });
  });
});
