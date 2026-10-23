import { Component, input, ChangeDetectionStrategy } from "@angular/core";
import { AccordionPanel } from "./accordion-panel.interface";

@Component({
    selector: "app-accordion",
    templateUrl: "./accordion.component.html",
    styleUrl: "./accordion.component.scss",
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class AccordionComponent {
  public readonly panels = input<AccordionPanel[]>([]);
}
