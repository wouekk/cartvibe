import { Component, Input, TemplateRef, input, output } from "@angular/core";
import { BehaviorSubject } from "rxjs";

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

  private rowOpen: BehaviorSubject<number | undefined> = new BehaviorSubject<
    number | undefined
  >(undefined);

  public rowOpenObservable = this.rowOpen.asObservable();

  public handleEditButtonClicked(index: number): void {
    this.rowOpen.next(index);
    this.editButtonClicked.emit(index);
  }

  public getCurrentRowOpen(): number | undefined {
    return this.rowOpen.value;
  }

  public handleDeleteButtonClicked(index: number): void {
    this.rowOpen.next(undefined);
    this.deleteButtonClicked.emit(index);
  }

  public openLastRow(): void {
    this.rowOpen.next(this.listData().length - 1);
  }

  public closeRow(): void {
    this.rowOpen.next(undefined);
  }
}
