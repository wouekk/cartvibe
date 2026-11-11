import { Component, ChangeDetectionStrategy } from '@angular/core';
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmTooltip } from "@spartan-ng/helm/tooltip";
import { RouterLink } from "@angular/router";
import { AppIconComponent } from "../icon/icon.component";
import { FormButtonComponent } from '../form-button/form-button.component';
import { TranslatePipe } from '../../i18n/translate.pipe';

@Component({
    selector: 'app-back-button',
    templateUrl: './back-button.component.html',
    styleUrls: ['./back-button.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [ TranslatePipe, HlmButton, HlmTooltip, RouterLink, AppIconComponent]
})
export class BackButtonComponent extends FormButtonComponent {}
