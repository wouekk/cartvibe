import { Component, ChangeDetectionStrategy } from '@angular/core';
import { FormButtonComponent } from '../form-button/form-button.component';
import { ButtonComponent } from '../../button/button/button.component';
import { TranslatePipe } from '../../i18n/translate.pipe';

@Component({
    selector: 'app-back-button',
    templateUrl: './back-button.component.html',
    styleUrls: ['./back-button.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [ButtonComponent, TranslatePipe]
})
export class BackButtonComponent extends FormButtonComponent {}
