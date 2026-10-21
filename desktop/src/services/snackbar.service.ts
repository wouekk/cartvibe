import { Injectable, TemplateRef } from "@angular/core";
import { DEFAULT_SNACKBAR_CONFIG } from "../constants/snackbar.constant";
import { SnackbarServiceInterface } from "../interfaces/snackbar.interface";
import { ToastConfig, ToastRef, ToastService } from "../toast/toast.service";

@Injectable({
  providedIn: "root",
})
export class SnackbarService implements SnackbarServiceInterface {
  constructor(private toast: ToastService) {}

  public info(message: string): void {
    this.toast.show("info", message, { ...DEFAULT_SNACKBAR_CONFIG, duration: undefined });
  }

  public error(message: string): void {
    this.toast.show("error", message, DEFAULT_SNACKBAR_CONFIG);
  }

  public success(message: string, configOverrides?: ToastConfig): void {
    this.toast.show("success", message, { ...DEFAULT_SNACKBAR_CONFIG, ...configOverrides });
  }

  public successFromTemplate(template: TemplateRef<any>, configOverrides?: ToastConfig): ToastRef {
    return this.toast.showTemplate(template, "success", { ...DEFAULT_SNACKBAR_CONFIG, ...configOverrides });
  }
}
