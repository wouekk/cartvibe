import { Component, ViewEncapsulation, ChangeDetectionStrategy } from "@angular/core";
import { BaseButtonComponent } from "../base-button/base-button.component";
import { BrnButton } from "@spartan-ng/brain/button";
import { HlmButton } from "../../ui/button/lib/hlm-button";
import { BrnTooltip } from "@spartan-ng/brain/tooltip";
import { HlmTooltip } from "../../ui/tooltip/lib/hlm-tooltip";
import { RouterLink } from "@angular/router";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { HlmBadge } from "../../ui/badge/lib/hlm-badge";
import { TranslatePipe } from "../../i18n/translate.pipe";

@Component({
    selector: "app-button",
    templateUrl: "./button.component.html",
    styleUrls: ["./button.component.scss"],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [BrnButton, HlmButton, BrnTooltip, HlmTooltip, RouterLink, AppIconComponent, HlmBadge, TranslatePipe]
})
export class ButtonComponent extends BaseButtonComponent {

  public emitClicked(event: MouseEvent): void {
    this.clicked.emit(event);
  }
}
