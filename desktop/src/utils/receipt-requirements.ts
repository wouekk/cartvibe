import { ReceiptRequirements } from "../open-api";
import { marker } from "../i18n/marker";

/**
 * Resolves the caller's role-required receipt fields for one group from
 * AppData's `groupReceiptRequirements`. The server has already applied every
 * waiver and only sends groups where something is required, so an absent group
 * (including the synthetic "All" group, or no group at all) requires nothing.
 */
export function receiptRequirementsFor(
  requirementsByGroup: { [groupId: number]: ReceiptRequirements } | undefined,
  groupId: number | string | null | undefined
): ReceiptRequirements {
  const numericGroupId = Number(groupId);
  const requirements =
    groupId && !Number.isNaN(numericGroupId)
      ? requirementsByGroup?.[numericGroupId]
      : undefined;

  return {
    commentRequired: requirements?.commentRequired ?? false,
    imageRequired: requirements?.imageRequired ?? false,
  };
}

/** The snackbar text for a submit blocked by missing required fields. */
export function missingReceiptRequirementsMessage(
  missingComment: boolean,
  missingImage: boolean
): string {
  if (missingImage && missingComment) {
    return marker("Your role requires an image and a comment on this group's receipts.");
  }
  return missingImage
    ? marker("Your role requires an image on this group's receipts.")
    : marker("Your role requires a comment on this group's receipts.");
}
