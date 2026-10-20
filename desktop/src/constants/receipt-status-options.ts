import { FormOption } from "src/interfaces/form-option.interface";
import { formatStatus } from "src/utils";
import { GroupStatus, ItemStatus, ReceiptStatus } from "../open-api";
import { DONE_LABEL, TO_CHECK_LABEL } from "../utils/receipt-status";

// The two statuses a family picks from (Phase 3 C6): "To check" writes OPEN, "Done" RESOLVED.
// Filters widen them to the statuses they stand for (toStatusWireFilter); see utils/receipt-status.
export const RECEIPT_STATUS_OPTIONS: FormOption[] = [
  { value: ReceiptStatus.Open, displayValue: TO_CHECK_LABEL },
  { value: ReceiptStatus.Resolved, displayValue: DONE_LABEL },
];

export const RECEIPT_ITEM_STATUS_OPTIONS: FormOption[] = Object.keys(
  ItemStatus
).map((key) => {
  const value = (ItemStatus as any)[key];
  return {
    value: value,
    displayValue: formatStatus(value),
  };
});

export const GROUP_STATUS_OPTIONS: FormOption[] = Object.keys(GroupStatus).map(
  (key) => {
    const value = (GroupStatus as any)[key];
    return {
      value: value,
      displayValue: formatStatus(value),
    };
  }
);
