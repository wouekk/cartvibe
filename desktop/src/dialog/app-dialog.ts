import { Dialog, DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { ComponentType } from "@angular/cdk/portal";
import { inject, Injectable, TemplateRef } from "@angular/core";
import { Observable, take } from "rxjs";

/** The data a dialog was opened with (inject it in the dialog component). */
export const APP_DIALOG_DATA = DIALOG_DATA;

export interface AppDialogConfig<D = any> {
  data?: D;
  width?: string;
  minWidth?: string;
  maxWidth?: string;
  height?: string;
  maxHeight?: string;
  disableClose?: boolean;
  panelClass?: string | string[];
  autoFocus?: boolean | "dialog" | "first-tabbable" | "first-heading" | (string & {});
}

/** What a dialog component injects to close itself, and what the opener holds: the shape callers already use. */
export class AppDialogRef<T = any, R = any> {
  constructor(private readonly ref: DialogRef<R, T>) {}

  public get componentInstance(): T {
    return this.ref.componentInstance as T;
  }

  public close(result?: R): void {
    this.ref.close(result);
  }

  /** Emits the result once, when the dialog has closed (undefined for a backdrop click or Escape). */
  public afterClosed(): Observable<R | undefined> {
    return this.ref.closed.pipe(take(1));
  }

  public backdropClick(): Observable<MouseEvent> {
    return this.ref.backdropClick;
  }
}

/**
 * Opens dialogs on the CDK dialog (the primitive spartan's own dialog uses) with the look of the theme's popover
 * surface. It keeps the `open / afterClosed / close / componentInstance` shape Angular Material's MatDialog had.
 */
@Injectable({ providedIn: "root" })
export class AppDialog {
  private readonly dialog = inject(Dialog);

  /** The dialogs open right now. */
  public get openDialogs(): readonly DialogRef<any, any>[] {
    return this.dialog.openDialogs;
  }

  public open<T, D = any, R = any>(
    content: ComponentType<T> | TemplateRef<T>,
    config: AppDialogConfig<D> = {}
  ): AppDialogRef<T, R> {
    let wrapper!: AppDialogRef<T, R>;
    const ref = this.dialog.open<R, D, T>(content, {
      data: config.data,
      width: config.width,
      minWidth: config.minWidth ?? "min(calc(100vw - 2rem), 28rem)",
      maxWidth: config.maxWidth ?? "calc(100vw - 2rem)",
      height: config.height,
      maxHeight: config.maxHeight ?? "calc(100vh - 2rem)",
      disableClose: config.disableClose,
      // An explicit undefined would override the CDK's own default and leave focus on the page behind the dialog.
      autoFocus: (config.autoFocus ?? "first-tabbable") as never,
      closeOnNavigation: true,
      panelClass: ["app-dialog-panel", ...(Array.isArray(config.panelClass) ? config.panelClass : config.panelClass ? [config.panelClass] : [])],
      backdropClass: "app-dialog-backdrop",
      providers: (dialogRef) => {
        wrapper = new AppDialogRef<T, R>(dialogRef as DialogRef<R, T>);
        return [{ provide: AppDialogRef, useValue: wrapper }];
      },
    });
    wrapper ??= new AppDialogRef<T, R>(ref as DialogRef<R, T>);

    return wrapper;
  }
}
