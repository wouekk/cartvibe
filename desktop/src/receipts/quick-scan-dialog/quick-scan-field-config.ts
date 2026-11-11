import { GroupReceiptSettings } from "../../open-api";

/**
 * Whether Quick Scan asks for a note beside the photo. A scan is a photo and nothing else: the person scanning
 * paid, the receipt starts as "To check", and its categories and tags come from its product lines. The one field
 * a household can add is the note, and hiding the note for the household hides it here too, without changing the
 * switch (the server's `IsQuickScanNoteShown` is the same rule, and drops a note sent anyway).
 *
 * `hasGroup` is whether a household is picked for the photo. Until one is, there are no settings to follow.
 */
export function quickScanAsksForNote(settings: GroupReceiptSettings | undefined, hasGroup: boolean): boolean {
  if (!hasGroup) {
    return false;
  }

  return (settings?.quickScanNoteEnabled ?? false) && !(settings?.hideNote ?? false);
}
