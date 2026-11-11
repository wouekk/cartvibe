import { FormOption } from "src/interfaces/form-option.interface";
import { formatStatus } from "src/utils";
import { GroupStatus, ReceiptStatus } from "../open-api";
import { SETTLED_LABEL, TO_CHECK_LABEL } from "../utils/receipt-status";

// The two statuses a receipt can have: "To check" is OPEN on the API, "Settled" RESOLVED.
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
