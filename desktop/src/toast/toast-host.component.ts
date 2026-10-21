import { NgTemplateOutlet } from "@angular/common";
import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucideCircleAlert, lucideCircleCheck, lucideInfo, lucideX } from "@ng-icons/lucide";
import { ToastKind, ToastService } from "./toast.service";

const ICONS: Record<ToastKind, string> = {
  success: "lucideCircleCheck",
  error: "lucideCircleAlert",
  info: "lucideInfo",
};

/** Draws the toasts: a card on the theme tokens that drops in from the top. Mounted once, in the app root. */
@Component({
  selector: "app-toast-host",
  standalone: true,
  imports: [NgIcon, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ lucideCircleAlert, lucideCircleCheck, lucideInfo, lucideX })],
  template: `
    <div class="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4" aria-live="polite">
      @for (toast of toasts.toasts(); track toast.id) {
        <div
          role="status"
          class="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-lg border bg-popover p-4 text-sm text-popover-foreground shadow-lg animate-in fade-in-0 slide-in-from-top-2 duration-200"
          [class.border-destructive]="toast.kind === 'error'"
          [attr.data-kind]="toast.kind"
          [attr.data-testid]="'toast-' + toast.kind"
        >
          <ng-icon
            size="18"
            class="mt-0.5 shrink-0"
            [name]="icon(toast.kind)"
            [class.text-destructive]="toast.kind === 'error'"
            [class.text-success-text]="toast.kind === 'success'"
          />
          <div class="min-w-0 flex-1 break-words">
            @if (toast.template) {
              <ng-container [ngTemplateOutlet]="toast.template" />
            } @else {
              {{ toast.message }}
            }
          </div>
          <button
            type="button"
            class="-m-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-label="Dismiss"
            data-testid="toast-dismiss"
            (click)="toasts.dismiss(toast.id)"
          >
            <ng-icon name="lucideX" size="16" />
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastHostComponent {
  public readonly toasts = inject(ToastService);

  public icon(kind: ToastKind): string {
    return ICONS[kind];
  }
}
