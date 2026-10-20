import { ReceiptStatus } from "../open-api";
import { familyReceiptStatus, receiptStatusLabel, toStatusWireFilter } from "./receipt-status";

describe("family receipt statuses (Phase 3 C6)", () => {
  it("labels every status as To check or Done", () => {
    expect(receiptStatusLabel(ReceiptStatus.Open)).toBe("To check");
    expect(receiptStatusLabel(ReceiptStatus.NeedsAttention)).toBe("To check");
    expect(receiptStatusLabel(ReceiptStatus.Draft)).toBe("To check");
    expect(receiptStatusLabel(ReceiptStatus.Resolved)).toBe("Done");
    expect(receiptStatusLabel(ReceiptStatus.Declined)).toBe("Done");
    expect(receiptStatusLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
    expect(receiptStatusLabel(undefined)).toBe("");
  });

  it("shows any status as one of the two picker values", () => {
    expect(familyReceiptStatus(ReceiptStatus.NeedsAttention)).toBe(ReceiptStatus.Open);
    expect(familyReceiptStatus(ReceiptStatus.Declined)).toBe(ReceiptStatus.Resolved);
    expect(familyReceiptStatus("")).toBe("");
  });

  it("widens a status filter on the wire, without touching the stored one", () => {
    const filter = { status: { operation: "CONTAINS", value: [ReceiptStatus.Open] }, name: { value: "x" } };

    const wire = toStatusWireFilter(filter) as any;

    expect(wire.status.value).toEqual([ReceiptStatus.Open, ReceiptStatus.NeedsAttention, ReceiptStatus.Draft]);
    expect(wire.status.operation).toBe("CONTAINS");
    expect(wire.name).toBe(filter.name);
    expect(filter.status.value).toEqual([ReceiptStatus.Open]);
    expect((toStatusWireFilter({ status: { value: [ReceiptStatus.Resolved] } }) as any).status.value).toEqual([
      ReceiptStatus.Resolved,
      ReceiptStatus.Declined,
    ]);
  });

  it("passes a filter without a status list through", () => {
    expect(toStatusWireFilter({ status: { value: "" } })).toEqual({ status: { value: "" } });
    expect(toStatusWireFilter(undefined)).toBeUndefined();
  });
});
