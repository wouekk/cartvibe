import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { Component, Inject, OnInit } from '@angular/core';
import { APP_DIALOG_DATA, AppDialogRef } from "../../dialog/app-dialog";
import { DEFAULT_RECEIPT_TABLE_COLUMNS, ReceiptTableColumnConfig } from '../../interfaces';
import { columnDisplayName, reconcileColumns } from '../../utils';

interface ColumnConfigItem extends ReceiptTableColumnConfig {
  displayName: string;
}

@Component({
  selector: 'app-column-configuration-dialog',
  templateUrl: './column-configuration-dialog.component.html',
  styleUrls: ['./column-configuration-dialog.component.scss'],
  standalone: false
})
export class ColumnConfigurationDialogComponent implements OnInit {
  public columns: ColumnConfigItem[] = [];

  constructor(
    private dialogRef: AppDialogRef<ColumnConfigurationDialogComponent>,
    @Inject(APP_DIALOG_DATA) public data: {
      currentColumns?: ReceiptTableColumnConfig[];
    }
  ) {}

  ngOnInit(): void {
    this.initializeColumns();
  }

  private initializeColumns(): void {
    this.setColumns(this.data.currentColumns ?? DEFAULT_RECEIPT_TABLE_COLUMNS);
  }

  /**
   * Reconciles against the built-in columns before display, so a column that no longer exists
   * disappears from the list and a new one shows up without the user resetting anything.
   *
   * `reconcileColumns` copies, which matters: the caller hands us the NGXS snapshot, and that is
   * deep-frozen in dev mode.
   */
  private setColumns(columns: ReceiptTableColumnConfig[]): void {
    this.columns = reconcileColumns(columns).map(
      (col) => ({
        ...col,
        displayName: columnDisplayName(col.matColumnDef),
      })
    );
  }

  public toggleColumnVisibility(column: ColumnConfigItem): void {
    column.visible = !column.visible;
  }

  public drop(event: CdkDragDrop<ColumnConfigItem[]>): void {
    moveItemInArray(this.columns, event.previousIndex, event.currentIndex);

    this.columns.forEach((column, index) => {
      column.order = index;
    });
  }

  /** Restores the built-in defaults. */
  public resetToDefaults(): void {
    this.setColumns(DEFAULT_RECEIPT_TABLE_COLUMNS);
  }

  public saveConfiguration(): void {
    const result: ReceiptTableColumnConfig[] = this.columns.map(
      ({ displayName, ...col }) => col
    );
    this.dialogRef.close(result);
  }

  public cancel(): void {
    this.dialogRef.close(null);
  }

  public get visibleColumnsCount(): number {
    return this.columns.filter(col => col.visible).length;
  }

  public canToggleOff(column: ColumnConfigItem): boolean {
    return this.visibleColumnsCount > 1 || !column.visible;
  }
}
