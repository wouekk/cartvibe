import { Component, ChangeDetectionStrategy } from '@angular/core';
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmTooltip } from "@spartan-ng/helm/tooltip";
import { AppIconComponent } from "../icon/icon.component";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { FormButtonComponent } from '../form-button/form-button.component';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-add-button',
    templateUrl: './add-button.component.html',
    styleUrls: ['./add-button.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [ RouterLink, HlmButton, HlmTooltip, AppIconComponent, TranslatePipe]
})
export class AddButtonComponent extends FormButtonComponent {}
