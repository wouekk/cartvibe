import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { NgIf } from '@angular/common';
import { AppIconComponent } from '../icon/icon.component';
import { BrnTooltip } from '@spartan-ng/brain/tooltip';
import { HlmTooltip } from '../../ui/tooltip/lib/hlm-tooltip';
import { TranslatePipe } from '../../i18n/translate.pipe';

@Component({
    selector: 'app-help-icon',
    templateUrl: './help-icon.component.html',
    styleUrls: ['./help-icon.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [NgIf, AppIconComponent, BrnTooltip, HlmTooltip, TranslatePipe]
})
export class HelpIconComponent {
  @Input() public helpText?: string;
}
