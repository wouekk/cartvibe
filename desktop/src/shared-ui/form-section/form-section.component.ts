import { Component, Input, OnInit, TemplateRef, input, ChangeDetectionStrategy } from "@angular/core";
import { NgClass, NgIf, NgTemplateOutlet } from "@angular/common";
import { AppIconComponent } from "../icon/icon.component";
import { TranslatePipe } from "../../i18n/translate.pipe";

@Component({
    selector: "app-form-section",
    templateUrl: "./form-section.component.html",
    styleUrls: ["./form-section.component.scss"],
    changeDetection: ChangeDetectionStrategy.Eager,
    host: { "[class.cv-section]": "panel()", "[class.mb-4]": "panel()", "[class.block]": "panel()" },
    imports: [NgClass, AppIconComponent, NgIf, NgTemplateOutlet, TranslatePipe]
})
export class FormSectionComponent implements OnInit {
  public readonly headerText = input<string>("");

  @Input() public headerButtonsTemplate?: TemplateRef<any>;

  public readonly indent = input<boolean>(true);

  /** Draws the section as the inset `cv-section` panel (overline title, quiet description) used by the settings pages. */
  public readonly panel = input<boolean>(false);

  @Input() public subtitle: string = "";

  public readonly collapsed = input<boolean>(false);

  public isCollapsed: boolean = false;

  public ngOnInit(): void {
    this.isCollapsed = this.collapsed();
  }

  public toggleCollapsed(): void {
    this.isCollapsed = !this.isCollapsed;
  }
}
