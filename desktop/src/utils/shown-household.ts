import { Group, GroupStatus } from "../open-api";

/**
 * The household the shell names: the chosen one, or the only real one while the synthetic "All" group is chosen (a
 * family with one household has nothing to switch between, so it never reads "All").
 */
export function shownHousehold(groups: Group[], selectedGroupId: number): Group | undefined {
  const real = groups.filter((group) => group.status !== GroupStatus.Archived && !group.isAllGroup);
  const selected = groups.find((group) => group.id === selectedGroupId);
  if (real.length > 1 || (selected && !selected.isAllGroup)) {
    return selected;
  }
  return real[0] ?? selected;
}
