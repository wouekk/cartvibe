import { Injectable, signal, TemplateRef } from "@angular/core";

export type ToastKind = "success" | "error" | "info";

export interface ToastConfig {
  /** Milliseconds before it closes by itself; undefined keeps it until dismissed. */
  duration?: number;
}

export interface Toast {
  id: number;
  kind: ToastKind;
  message?: string;
  template?: TemplateRef<unknown>;
}

export interface ToastRef {
  dismiss(): void;
}

/** The toasts on screen (top center), drawn by ToastHostComponent. Replaces Material's snack bar. */
@Injectable({ providedIn: "root" })
export class ToastService {
  public readonly toasts = signal<Toast[]>([]);

  private nextId = 1;

  public show(kind: ToastKind, message: string, config: ToastConfig = {}): ToastRef {
    return this.add({ id: this.nextId++, kind, message }, config);
  }

  public showTemplate(template: TemplateRef<unknown>, kind: ToastKind, config: ToastConfig = {}): ToastRef {
    return this.add({ id: this.nextId++, kind, template }, config);
  }

  public dismiss(id: number): void {
    this.toasts.update((toasts) => toasts.filter((toast) => toast.id !== id));
  }

  /** A new toast replaces what is showing, as the snack bar did, so two messages are never stacked. */
  private add(toast: Toast, config: ToastConfig): ToastRef {
    this.toasts.set([toast]);
    if (config.duration && config.duration > 0) {
      setTimeout(() => this.dismiss(toast.id), config.duration);
    }

    return { dismiss: () => this.dismiss(toast.id) };
  }
}
