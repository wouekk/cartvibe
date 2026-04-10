import { Component, Input, signal, TemplateRef, input, output } from "@angular/core";

@Component({
    selector: "app-editable-list",
    templateUrl: "./editable-list.component.html",
    styleUrl: "./editable-list.component.scss",
    standalone: false
})
export class EditableListComponent {
  public readonly listData = input<any[]>([]);

  public readonly itemTitleTemplate = input.required<TemplateRef<any>>();

  public readonly itemSubtitleTemplate = input.required<TemplateRef<any>>();

  public readonly trackByKey = input<string>("");

  @Input() public editTemplate?: TemplateRef<any>;

  public readonly readonly = input<boolean>(false);

  public readonly editButtonClicked = output<number>();

  public readonly deleteButtonClicked = output<number>();

  public readonly rowOpen = signal<number | undefined>(undefined);

  public handleEditButtonClicked(index: number): void {
    this.rowOpen.set(index);
    this.editButtonClicked.emit(index);
  }

  public getCurrentRowOpen(): number | undefined {
    return this.rowOpen();
  }

  public handleDeleteButtonClicked(index: number): void {
    this.rowOpen.set(undefined);
    this.deleteButtonClicked.emit(index);
  }

  public openLastRow(index?: number): void {
    this.rowOpen.set(index ?? this.listData().length - 1);
  }

  public closeRow(): void {
    this.rowOpen.set(undefined);
  }
}
