import { Component, ChangeDetectionStrategy } from '@angular/core';
import { FormButtonComponent } from '../form-button/form-button.component';

@Component({
    selector: 'app-add-button',
    templateUrl: './add-button.component.html',
    styleUrls: ['./add-button.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class AddButtonComponent extends FormButtonComponent {}
