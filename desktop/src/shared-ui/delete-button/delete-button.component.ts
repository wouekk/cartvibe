import { Component, ChangeDetectionStrategy } from '@angular/core';
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmTooltip } from "@spartan-ng/helm/tooltip";
import { FormButtonComponent } from '../form-button/form-button.component';

import { AppIconComponent } from "../icon/icon.component";
import { TranslatePipe } from "../../i18n/translate.pipe";
@Component({
    selector: 'app-delete-button',
    templateUrl: './delete-button.component.html',
    styleUrls: ['./delete-button.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [ HlmButton, HlmTooltip, AppIconComponent, TranslatePipe]
})
export class DeleteButtonComponent extends FormButtonComponent {
  constructor() {
    super();
    this.color = 'warn';
  }
}
