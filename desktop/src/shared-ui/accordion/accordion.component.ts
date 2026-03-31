import { Component, input } from "@angular/core";
import { AccordionPanel } from "./accordion-panel.interface";

@Component({
    selector: "app-accordion",
    templateUrl: "./accordion.component.html",
    styleUrl: "./accordion.component.scss",
    standalone: false
})
export class AccordionComponent {
  public readonly panels = input<AccordionPanel[]>([]);
}
