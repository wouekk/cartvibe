import { ChangeDetectionStrategy, Component, Inject, computed, inject, signal } from "@angular/core";
import { APP_DIALOG_DATA, AppDialogRef } from "../../../dialog/app-dialog";
import { GroupStore, AuthStore } from "src/store";
import { Permission } from "../../../open-api";
import { CHIP_COLORS, groupInitials } from "../../models/report-chip.util";
import { DialogComponent } from "../../../shared-ui/dialog/dialog.component";
import { AppIconComponent } from "../../../shared-ui/icon/icon.component";
import { BrnButton } from "@spartan-ng/brain/button";
import { HlmButton } from "../../../ui/button/lib/hlm-button";
import { DialogFooterComponent } from "../../../shared-ui/dialog-footer/dialog-footer.component";
import { TranslatePipe } from "../../../i18n/translate.pipe";

export interface AddGroupDialogData {
  selectedGroupIds: string[];
}

interface GroupChoice {
  id: string;
  name: string;
  initials: string;
  color: string;
  selected: boolean;
}

/**
 * Picks the groups a report covers, limited to groups where the user holds
 * group.reports.read (the permission that authorizes generation). Returns the
 * selected group-id array on submit, or undefined on cancel.
 */
@Component({
    selector: "app-add-group-dialog",
    templateUrl: "./add-group-dialog.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        DialogComponent,
        AppIconComponent,
        BrnButton,
        HlmButton,
        DialogFooterComponent,
        TranslatePipe,
    ],
})
export class AddGroupDialogComponent {
  private readonly authStore = inject(AuthStore);

  private readonly groupStore = inject(GroupStore);

  private readonly dialogRef = inject<AppDialogRef<AddGroupDialogComponent, string[]>>(AppDialogRef);
  private readonly selectedIds = signal<Set<string>>(new Set());

  public readonly groups = computed<GroupChoice[]>(() => {
    const selected = this.selectedIds();
    return this.groupStore.groupsWithoutAll()
      .filter(
        (group) =>
          group.id != null &&
          this.authStore.hasGroupPermission(group.id, Permission.GroupReportsRead)
      )
      .map((group, index) => {
        const id = group.id!.toString();
        return {
          id,
          name: group.name ?? id,
          initials: groupInitials(group.name),
          color: CHIP_COLORS[index % CHIP_COLORS.length],
          selected: selected.has(id),
        };
      });
  });

  constructor(@Inject(APP_DIALOG_DATA) data: AddGroupDialogData) {
    this.selectedIds.set(new Set(data.selectedGroupIds ?? []));
  }

  public toggle(id: string): void {
    this.selectedIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  public submit(): void {
    this.dialogRef.close([...this.selectedIds()]);
  }

  public cancel(): void {
    this.dialogRef.close();
  }
}
