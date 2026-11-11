import { Component, input, ChangeDetectionStrategy } from "@angular/core";
import { AccordionPanel } from "./accordion-panel.interface";
import { NgFor, NgIf, NgTemplateOutlet } from "@angular/common";
import { ExpansionPanelComponent } from "../expansion-panel/expansion-panel.component";

@Component({
    selector: "app-accordion",
    templateUrl: "./accordion.component.html",
    styleUrl: "./accordion.component.scss",
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [NgFor, ExpansionPanelComponent, NgIf, NgTemplateOutlet]
})
export class AccordionComponent {
  public readonly panels = input<AccordionPanel[]>([]);
}
