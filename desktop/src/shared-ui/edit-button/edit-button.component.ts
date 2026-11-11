import { Component, ChangeDetectionStrategy } from '@angular/core';
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmTooltip } from "@spartan-ng/helm/tooltip";
import { FormButtonComponent } from '../form-button/form-button.component';

import { RouterLink } from "@angular/router";
import { AppIconComponent } from "../icon/icon.component";
import { TranslatePipe } from "../../i18n/translate.pipe";
@Component({
    selector: 'app-edit-button',
    templateUrl: './edit-button.component.html',
    styleUrls: ['./edit-button.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [ HlmButton, HlmTooltip, RouterLink, AppIconComponent, TranslatePipe]
})
export class EditButtonComponent extends FormButtonComponent {}
