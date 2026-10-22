import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormGroupDirective } from '@angular/forms';
import { Store } from '@ngxs/store';
import { FormMode } from 'src/enums/form-mode.enum';
import { LayoutState } from 'src/store/layout.state';
import { FormButtonComponent } from '../form-button/form-button.component';

/**
 * The app's Save button: the filled accent button, labelled. While an edit form
 * has nothing to save (its form is pristine) it is the same button dimmed, the
 * one inactive look every save shares. Add forms are never dimmed this way, so a
 * prefilled add dialog still submits.
 */
@Component({
    selector: 'app-submit-button',
    templateUrl: './submit-button.component.html',
    standalone: false
})
export class SubmitButtonComponent extends FormButtonComponent implements OnInit {
  public readonly onlyIcon = input<boolean>(false);

  public readonly disableOnLoading = input<boolean>(false);

  public override readonly type = input<'button' | 'submit'>('submit');

  public formMode = FormMode;

  private readonly store = inject(Store);

  private readonly destroyRef = inject(DestroyRef);

  // The form this button submits, when it sits inside one.
  private readonly formGroupDirective = inject(FormGroupDirective, { optional: true });

  private readonly formPristine = signal(false);

  private showProgressBar = this.store.selectSignal(LayoutState.showProgressBar);

  public effectiveDisabled = computed(() => {
    if (this.disableOnLoading() && this.showProgressBar()) {
      return true;
    }
    if (this.mode() === FormMode.edit && this.formPristine()) {
      return true;
    }
    return this.disabled();
  });

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
