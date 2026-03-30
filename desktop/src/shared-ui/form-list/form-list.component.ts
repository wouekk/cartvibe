import {
  Component,
  TemplateRef,
  input,
  output
} from '@angular/core';

@Component({
    selector: 'app-form-list',
    templateUrl: './form-list.component.html',
    styleUrls: ['./form-list.component.scss'],
    standalone: false
})
export class FormListComponent {
  public readonly array = input<any[]>([]);

  public readonly itemDisplayTemplate = input.required<TemplateRef<any>>();

  public readonly itemEditTemplate = input.required<TemplateRef<any>>();

  public readonly nothingToDisplayText = input<string>('');

  public readonly addButtonText = input<string>('');

  public readonly headerText = input<string>('');

  public readonly disabled = input<boolean>(false);

  public readonly addButtonClicked = output<void>();

  public readonly itemDoneButtonClicked = output<number>();

  public readonly itemCancelButtonClicked = output<number>();

  public readonly itemDeleteButtonClicked = output<number>();

  public editingIndex: number = -1;

  public onAddButtonClicked(): void {
    this.editingIndex = this.array().length;
    this.addButtonClicked.emit();
  }

  public onDoneButtonClicked(index: number): void {
    this.itemDoneButtonClicked.emit(index);
  }

  public onItemCancelButtonClicked(index: number): void {
    this.resetEditingIndex();
    this.itemCancelButtonClicked.emit(index);
  }

  public resetEditingIndex(): void {
    this.editingIndex = -1;
  }

  public onItemEditButtonClicked(index: number): void {
    this.editingIndex = index;
  }

  public onItemDeleteButtonClicked(index: number): void {
    this.itemDeleteButtonClicked.emit(index);
  }
}
