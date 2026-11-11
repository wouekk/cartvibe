import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  signal,
  ChangeDetectionStrategy
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormGroupDirective } from '@angular/forms';
import { FormMode } from 'src/enums/form-mode.enum';
import { LayoutStore } from "src/store/layout.store";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmTooltip } from "@spartan-ng/helm/tooltip";
import { AppIconComponent } from "../icon/icon.component";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { FormButtonComponent } from '../form-button/form-button.component';
import { NgIf } from '@angular/common';

/**
 * The app's Save button: the filled accent button, labelled. While an edit form
 * has nothing to save (its form is pristine) it is the same button dimmed, the
 * one inactive look every save shares. Add forms are never dimmed this way, so a
 * prefilled add dialog still submits.
 */
@Component({
    selector: 'app-submit-button',
    templateUrl: './submit-button.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [NgIf, HlmButton, HlmTooltip, AppIconComponent, TranslatePipe]
})
export class SubmitButtonComponent extends FormButtonComponent implements OnInit {
  private readonly layoutStore = inject(LayoutStore);

  public readonly onlyIcon = input<boolean>(false);

  public readonly disableOnLoading = input<boolean>(false);

  /** Red, for a button that deletes or removes (a confirmation's Delete / Remove). */
  public readonly destructive = input<boolean>(false);

  public override readonly type = input<'button' | 'submit'>('submit');

  public formMode = FormMode;

  private readonly destroyRef = inject(DestroyRef);

  // The form this button submits, when it sits inside one.
  private readonly formGroupDirective = inject(FormGroupDirective, { optional: true });

  private readonly formPristine = signal(false);

  private showProgressBar = this.layoutStore.showProgressBar;

  public effectiveDisabled = computed(() => {
    if (this.disableOnLoading() && this.showProgressBar()) {
      return true;
    }
    if (this.mode() === FormMode.edit && this.formPristine()) {
      return true;
    }
    return this.disabled();
  });

  /**
   * For an edit form that does not pass `mode` (and so is not dimmed while unchanged, as `FormMode.edit` makes it): the
   * button still wears the unsaved-changes halo once the form changes.
   */
  public readonly highlightUnsaved = input<boolean>(false);

  /**
   * An edit form with changes waiting: the button is live and wears the `cv-unsaved` halo until the form is saved (and so
   * pristine again). An add form has nothing saved yet, and a disabled button has nothing to save, so neither glows.
   */
  public readonly unsaved = computed(
    () =>
      (this.mode() === FormMode.edit || this.highlightUnsaved()) && !this.formPristine() && !this.effectiveDisabled()
  );

  public ngOnInit(): void {
    // The form is an input of its directive, so it is only set by now. Every
    // event re-reads pristine from the form itself: a child's event carries the
    // child's state, not the form's.
    const form = this.formGroupDirective?.form;
    if (!form) {
      return;
    }
    this.formPristine.set(form.pristine);
    form.events
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.formPristine.set(form.pristine));
  }
}
