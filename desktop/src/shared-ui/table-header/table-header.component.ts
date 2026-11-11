import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { TranslatePipe } from '../../i18n/translate.pipe';

@Component({
    selector: 'app-table-header',
    templateUrl: './table-header.component.html',
    host: { class: 'my-2 mb-6 block' },
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [TranslatePipe]
})
export class TableHeaderComponent {
  public readonly headerText = input<string>('');

  public readonly subtitle = input<string>('');
}
