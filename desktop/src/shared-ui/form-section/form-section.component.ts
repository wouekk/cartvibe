import { Component, Input, OnInit, TemplateRef, input } from "@angular/core";

@Component({
    selector: "app-form-section",
    templateUrl: "./form-section.component.html",
    styleUrls: ["./form-section.component.scss"],
    standalone: false
})
export class FormSectionComponent implements OnInit {
  public readonly headerText = input<string>("");

  @Input() public headerButtonsTemplate?: TemplateRef<any>;

  public readonly indent = input<boolean>(true);

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
