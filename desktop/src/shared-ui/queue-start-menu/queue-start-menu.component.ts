import { Component, OnInit, input, ChangeDetectionStrategy, inject } from "@angular/core";
import { Store } from "@ngxs/store";
import { Permission, Receipt } from "../../open-api/index";
import { QueueMode, ReceiptQueueService } from "../../services/receipt-queue.service";
import { AuthState, GroupStore } from "../../store/index";
import { CdkMenuTrigger, CdkMenu, CdkMenuItem } from "@angular/cdk/menu";
import { HlmDropdownMenuTrigger } from "../../ui/dropdown-menu/lib/hlm-dropdown-menu-trigger";
import { HlmDropdownMenu } from "../../ui/dropdown-menu/lib/hlm-dropdown-menu";
import { HlmDropdownMenuFocusOnHover } from "../../ui/dropdown-menu/lib/hlm-dropdown-menu-focus-on-hover";
import { HlmDropdownMenuItem } from "../../ui/dropdown-menu/lib/hlm-dropdown-menu-item";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmTooltip } from "@spartan-ng/helm/tooltip";
import { AppIconComponent } from "../icon/icon.component";

@Component({
    selector: "app-queue-start-menu",
    templateUrl: "./queue-start-menu.component.html",
    styleUrl: "./queue-start-menu.component.scss",
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [ CdkMenuTrigger, HlmDropdownMenuTrigger, CdkMenu, HlmDropdownMenu, CdkMenuItem, HlmDropdownMenuFocusOnHover, HlmDropdownMenuItem, TranslatePipe, HlmButton, HlmTooltip, AppIconComponent]
})
export class QueueStartMenuComponent implements OnInit {
  private readonly groupStore = inject(GroupStore);

  public readonly buttonText = input<string>("");

  public readonly buttonIcon = input<string>("");

  public readonly receiptIds = input<string[] | number[]>([]);

  public readonly receipts = input<Receipt[]>([]);

  protected readonly QueueMode = QueueMode;

  public canEdit: boolean = false;

  constructor(
    private receiptQueueService: ReceiptQueueService,
    private store: Store,
  ) {}

  public ngOnInit(): void {
    this.setCanEdit();
  }

  private setCanEdit(): void {
    const groupId = this.groupStore.selectedGroupId();
    this.canEdit = this.store.selectSnapshot(
      AuthState.hasGroupPermission(Number.parseInt(groupId), Permission.GroupReceiptsUpdate)
    );
  }

  private getReceiptIds(): string[] {
    if (this.receiptIds().length > 0) {
      return this.receiptIds().map(id => id.toString());
    } else if (this.receipts().length > 0) {
      return this.receipts().map(receipt => receipt.id.toString());
    } else {
      return [];
    }
  }

  public initQueue(mode: QueueMode): void {
    this.receiptQueueService.initQueueAndNavigate(this.getReceiptIds(), mode);
  }
}
