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
      <app-submit-button [mode]="mode()" [highlightUnsaved]="highlight()"></app-submit-button>
    </form>
  `,
    imports: [ButtonModule, ReactiveFormsModule, SubmitButtonComponent],
})
class HostComponent {
  public readonly form = new FormGroup({ name: new FormControl("Milk") });
  public readonly mode = signal<FormMode>(FormMode.edit);
  public readonly highlight = signal(false);
}

describe("SubmitButtonComponent", () => {
  let component: SubmitButtonComponent;
  let fixture: ComponentFixture<SubmitButtonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    imports: [ButtonModule, ReactiveFormsModule, NgxsModule.forRoot([LayoutState]), SubmitButtonComponent, HostComponent],
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

    describe("the unsaved-changes halo", () => {
      const change = async () => {
        host.componentInstance.form.get("name")!.setValue("Bread");
        host.componentInstance.form.markAsDirty();
        host.detectChanges();
        await host.whenStable();
      };

      it("is off while nothing has changed", () => {
        expect(saveButton().classList.contains("cv-unsaved")).toBe(false);
      });

      it("comes on with the first change and goes once the form is saved", async () => {
        await change();
        expect(saveButton().classList.contains("cv-unsaved")).toBe(true);

        host.componentInstance.form.markAsPristine();
        host.detectChanges();
        await host.whenStable();
        expect(saveButton().classList.contains("cv-unsaved")).toBe(false);
      });

      it("glows for an edit form that passes no mode and so is not dimmed while unchanged", async () => {
        host.componentInstance.mode.set(undefined as unknown as FormMode);
        host.componentInstance.highlight.set(true);
        host.detectChanges();
        await host.whenStable();
        expect(saveButton().classList.contains("cv-unsaved")).toBe(false);

        await change();
        expect(saveButton().disabled).toBe(false);
        expect(saveButton().classList.contains("cv-unsaved")).toBe(true);
      });

      it("is not shown on an add form: nothing is saved yet, so nothing is unsaved", async () => {
        host.componentInstance.mode.set(FormMode.add);
        await change();
        expect(saveButton().disabled).toBe(false);
        expect(saveButton().classList.contains("cv-unsaved")).toBe(false);
      });
    });
  });
});
