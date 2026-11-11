import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { HlmSwitch } from '../../ui/switch/lib/hlm-switch';

@Component({
    selector: 'app-slide-toggle',
    templateUrl: './slide-toggle.component.html',
    styleUrls: ['./slide-toggle.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [HlmSwitch]
})
export class SlideToggleComponent {
  public readonly color = input<string>('');

  public readonly checked = input<boolean>(false);

  public readonly disabled = input<boolean>(false);
}
