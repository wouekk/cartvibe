import { ChangeDetectionStrategy, Component } from "@angular/core";
import { TranslatePipe } from "../i18n/translate.pipe";

/**
 * The same two quiet lines that end every page of the project site (`site/src/components/Footer.astro`): the licence and
 * the credit link, then what the page does not do. Keep the wording in step with it.
 */
@Component({
  selector: "app-demo-footer",
  host: { class: "block shrink-0" },
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <footer class="border-t border-border/70 px-4 py-4 text-center text-[0.8125rem] text-muted-foreground sm:px-6" data-testid="demo-footer">
      <p class="m-0">
        {{ 'Free software under the GNU AGPL-3.0' | t }} · {{ 'Upstream credits in' | t }}
        <a
          class="font-medium text-foreground underline underline-offset-2 transition-colors duration-150 hover:text-primary"
          href="https://github.com/wouekk/cartvibe/blob/main/NOTICE.md"
          target="_blank"
          rel="noopener noreferrer"
          data-testid="demo-footer-notice"
          >NOTICE</a
        >
      </p>
      <p class="m-0 mt-1">{{ 'This site sets no cookies and runs no analytics or third-party scripts.' | t }}</p>
    </footer>
  `,
})
export class DemoFooterComponent {}
