import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmTooltip } from "@spartan-ng/helm/tooltip";
import { AppIconComponent } from "../icon/icon.component";
import { FormMode } from 'src/enums/form-mode.enum';
import { TranslatePipe } from '../../i18n/translate.pipe';

@Component({
    selector: 'app-cancel-button',
    templateUrl: './cancel-button.component.html',
    styleUrls: ['./cancel-button.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [ TranslatePipe, HlmButton, HlmTooltip, AppIconComponent]
})
export class CancelButtonComponent {
  public readonly mode = input<FormMode>();

  public readonly disabled = input<boolean>(false);

  public readonly clicked = output<void>();

  public formMode = FormMode;
}
