import { ReceiptStatus } from "../open-api";
import { isSettled, isToCheck, receiptStatusLabel } from "./receipt-status";

describe("receipt status", () => {
  it("reads the two statuses in a family's words, and anything else as it came", () => {
    expect(receiptStatusLabel(ReceiptStatus.Open)).toBe("To check");
    expect(receiptStatusLabel(ReceiptStatus.Resolved)).toBe("Settled");
    expect(receiptStatusLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
    expect(receiptStatusLabel(undefined)).toBe("");
    expect(receiptStatusLabel("")).toBe("");
  });

  it("knows which receipts are to check and which are settled", () => {
    expect(isToCheck(ReceiptStatus.Open)).toBe(true);
    expect(isToCheck(ReceiptStatus.Resolved)).toBe(false);
    expect(isSettled(ReceiptStatus.Resolved)).toBe(true);
    expect(isSettled(ReceiptStatus.Open)).toBe(false);
    // A receipt without a status, or with one this version does not know, is neither.
    expect(isToCheck("")).toBe(false);
    expect(isSettled(undefined)).toBe(false);
    expect(isSettled("SOMETHING_NEW")).toBe(false);
  });
});
