import { Component, input } from '@angular/core';

@Component({
    selector: 'app-table-header',
    templateUrl: './table-header.component.html',
    host: { class: 'my-2 mb-6 block' },
    standalone: false
})
export class TableHeaderComponent {
  public readonly headerText = input<string>('');

  public readonly subtitle = input<string>('');
}
