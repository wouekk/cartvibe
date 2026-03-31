import { Component, input } from '@angular/core';
import { FormControl } from '@angular/forms';
import { RadioButtonData } from '../models';

@Component({
    selector: 'app-radio-group',
    templateUrl: './radio-group.component.html',
    styleUrls: ['./radio-group.component.scss'],
    standalone: false
})
export class RadioGroupComponent {
  public readonly radioButtonData = input<RadioButtonData[]>([]);

  public readonly inputFormControl = input<FormControl>(new FormControl(''));
}
