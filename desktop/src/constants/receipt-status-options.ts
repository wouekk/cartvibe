import { FormOption } from "src/interfaces/form-option.interface";
import { formatStatus } from "src/utils";
import { GroupStatus, ReceiptStatus } from "../open-api";
import { SETTLED_LABEL, TO_CHECK_LABEL } from "../utils/receipt-status";

// The two statuses a family picks from (Phase 3 C6): "To check" writes OPEN, "Settled" RESOLVED.
// Filters widen them to the statuses they stand for (toStatusWireFilter); see utils/receipt-status.
export const RECEIPT_STATUS_OPTIONS: FormOption[] = [
  { value: ReceiptStatus.Open, displayValue: TO_CHECK_LABEL },
  { value: ReceiptStatus.Resolved, displayValue: SETTLED_LABEL },
];

export const GROUP_STATUS_OPTIONS: FormOption[] = Object.keys(GroupStatus).map(
  (key) => {
    const value = (GroupStatus as any)[key];
    return {
      value: value,
      displayValue: formatStatus(value),
    };
  }
);

// Every API status, under its own name: for an admin's configuration that is keyed on the real
// statuses (a group's receipt summary breakdown), not for picking one.
export const ALL_RECEIPT_STATUS_OPTIONS: FormOption[] = Object.keys(
  ReceiptStatus
).filter(k => !!(ReceiptStatus as any)[k]).map((key) => {
  const value = (ReceiptStatus as any)[key];
  return {
    value: value,
    displayValue: formatStatus(value),
  };
});
