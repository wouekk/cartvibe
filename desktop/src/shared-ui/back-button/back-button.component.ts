import { Component, ChangeDetectionStrategy } from '@angular/core';
import { FormButtonComponent } from '../form-button/form-button.component';

@Component({
    selector: 'app-back-button',
    templateUrl: './back-button.component.html',
    styleUrls: ['./back-button.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class BackButtonComponent extends FormButtonComponent {}
