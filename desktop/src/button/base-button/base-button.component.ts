import { Component, computed, Input, input, output, ChangeDetectionStrategy } from "@angular/core";

@Component({
    selector: "app-base-button",
    template: "", // a base class: subclasses bring their own template
    changeDetection: ChangeDetectionStrategy.Eager,
})
export class BaseButtonComponent {
  public readonly buttonClass = input<string>("");

  public readonly color = input<string>("primary");

  public readonly buttonText = input<string>("");

  public readonly type = input<"button" | "menu" | "submit" | "reset">("button");

  public readonly buttonType = input<"raised" | "iconButton" | "basic">("raised");

  @Input() public icon: string = "";

  @Input() public customIcon: string = "";

  public readonly disabled = input<boolean>(false);

  public readonly buttonRouterLink = input<string[]>();

  public readonly buttonQueryParams = input<any>({});

  public readonly tooltip = input<string>("");

  public readonly badgeContent = input<any>();

  public readonly badgeColor = input<"primary" | "accent" | "warn" | undefined>("primary");

  /** No badge for an empty count: nothing, an empty string or a zero (a red "0" says nothing). */
  public readonly badgeHidden = computed(() => {
    const content = this.badgeContent();
    return content === undefined || content === null || content === "" || content === 0 || content === "0";
  });

  public readonly clicked = output<MouseEvent>();
}
