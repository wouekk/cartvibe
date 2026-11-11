import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RadioButtonData } from '../models';
import { BrnFieldControl, BrnFieldControlDescribedBy } from '@spartan-ng/brain/field';
import { BrnRadioGroup } from '@spartan-ng/brain/radio-group';
import { HlmRadioGroup } from '../../ui/radio-group/lib/hlm-radio-group';
import { HlmRadio } from '../../ui/radio-group/lib/hlm-radio';
import { HlmRadioIndicator } from '../../ui/radio-group/lib/hlm-radio-indicator';
import { TranslatePipe } from '../../i18n/translate.pipe';

@Component({
    selector: 'app-radio-group',
    templateUrl: './radio-group.component.html',
    styleUrls: ['./radio-group.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [BrnFieldControl, BrnRadioGroup, BrnFieldControlDescribedBy, HlmRadioGroup, ReactiveFormsModule, HlmRadio, HlmRadioIndicator, TranslatePipe]
})
export class RadioGroupComponent {
  public readonly radioButtonData = input<RadioButtonData[]>([]);

  public readonly inputFormControl = input<FormControl>(new FormControl(''));
}
