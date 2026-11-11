import { computed, inject, Injectable } from "@angular/core";
import { Group } from "../open-api/model/group";
import { GroupMember } from "../open-api/model/groupMember";
import { ReceiptTableStore } from "./receipt-table.store";
import { StateStore } from "./state-store";

export interface GroupStateInterface {
  groups: Group[];
  selectedGroupId: string;
}

/** The person's households and the one that is open; read at every start and kept between visits. */
@Injectable({ providedIn: "root" })
export class GroupStore extends StateStore<GroupStateInterface> {
  private readonly receiptTableStore = inject(ReceiptTableStore);

  public readonly groups = computed(() => this.state().groups);

  public readonly allGroupMembers = computed((): GroupMember[] => this.groups().map((g) => g.groupMembers).flat());

  public readonly groupsWithoutAll = computed(() => this.groups().filter((g) => !g.isAllGroup));

  /**
   * The user's only real group, when they belong to exactly one -- a picker with
   * a single option is not a choice, so the receipt form and quick scan seed it
   * rather than making the user pick it. Undefined when they have several (or
   * none): built off `groupsWithoutAll` so the auto-selected set and the set the
   * pickers offer cannot drift apart.
   */
  public readonly soleGroupId = computed((): number | undefined => {
    const groups = this.groupsWithoutAll();
    return groups.length === 1 ? groups[0].id : undefined;
  });

  public readonly selectedGroupId = computed(() => this.state().selectedGroupId);

  /**
   * The group a new receipt would land in when that is not a choice: the
   * actively selected group, or -- when that is the synthetic "All" group, or
   * nothing is selected, or the selection no longer resolves (`selectedGroupId`
   * is persisted, so it outlives a group the user has left) -- the user's only
   * group. Undefined when they genuinely have to pick.
   *
   * Resolved off `groupsWithoutAll`, so "not a real, still-current group" is a
   * single lookup miss rather than three separate checks. Callers that must
   * always name a group (the permission gate, the route guard) fall back to
   * `selectedGroupId` themselves; the form treats undefined as "leave blank".
   */
  public readonly addTargetGroupId = computed((): number | undefined => {
    const selected = this.groupsWithoutAll().find((g) => g.id.toString() === this.selectedGroupId());
    return selected?.id ?? this.soleGroupId();
  });

  public readonly groupsWithoutSelectedGroup = computed(() => this.groups().filter((g) => g.id.toString() !== this.selectedGroupId()));

  public readonly receiptListLink = computed(() => `/receipts/group/${this.selectedGroupId()}`);

  public readonly warrantiesLink = computed(() => `/warranties/group/${this.selectedGroupId()}`);

  /** The guards' fallback landing. The old widget dashboards redirected here when unreadable. */
  public readonly dashboardLink = computed(() => `/receipts/group/${this.selectedGroupId()}`);

  /**
   * Where the app lands: after signing in, and when switching groups. The guards' fallback redirects
   * still use dashboardLink.
   */
  public readonly overviewLink = computed(() => `/overview/group/${this.selectedGroupId()}`);

  public readonly settingsLinkBase = computed(() => `/groups/${this.selectedGroupId()}/settings`);

  constructor() {
    super(() => ({ groups: [], selectedGroupId: "" }), "groups");
  }

  /** The household with this id. Reads the signal, so it follows the list inside a `computed`. */
  public getGroupById(groupId: string): Group | undefined {
    return this.groups().find((g) => g.id.toString() === groupId.toString());
  }

  public addGroup(group: Group): void {
    this.patch({ groups: [...this.groups(), group] });
  }

  public removeGroup(groupId: string): void {
    const state = this.state();
    const group = this.getGroupById(groupId);
    if (!group) {
      return;
    }

    const groups = state.groups.filter((g) => g.id !== group.id);
    const removedSelectedGroup = group.id.toString() === state.selectedGroupId.toString();
    if (!removedSelectedGroup) {
      this.patch({ groups });
      return;
    }

    // Fall back to the first *remaining* group: the list before the removal could point at the group just
    // deleted. The switch clears the receipts list's filter and page the same way a normal one does
    // (setSelectedGroupId), or the fallback group would inherit the deleted group's filter.
    this.patch({ groups, selectedGroupId: groups[0]?.id?.toString() ?? "" });
    this.resetReceiptsList();
  }

  public setGroups(groups: Group[]): void {
    this.patch({ groups });
  }

  public updateGroup(group: Group): void {
    const index = this.groups().findIndex((g) => g.id?.toString() === group?.id?.toString());
    if (index > -1) {
      const groups = Array.from(this.groups());
      groups[index] = group;
      this.patch({ groups });
    }
  }

  /** Opens a household; with no id, the first one. */
  public setSelectedGroupId(groupId?: string): void {
    const previousGroupId = this.selectedGroupId();
    const next = groupId || this.groups()[0].id.toString();

    this.patch({ selectedGroupId: next });

    // The receipts list's state is global (one filter shared across all groups),
    // so a filter set on one group would otherwise bleed into the next. Switching
    // to a different group starts it with a clean filter and first page; columns,
    // page size and sort stay global. Same-group re-selection is a no-op.
    if (next !== previousGroupId) {
      this.resetReceiptsList();
    }
  }

  private resetReceiptsList(): void {
    this.receiptTableStore.resetFilter();
    this.receiptTableStore.setPage(1);
  }
}
