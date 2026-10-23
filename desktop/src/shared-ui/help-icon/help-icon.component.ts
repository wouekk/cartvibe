import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

@Component({
    selector: 'app-help-icon',
    templateUrl: './help-icon.component.html',
    styleUrls: ['./help-icon.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class HelpIconComponent {
  @Input() public helpText?: string;
}
