import { GroupReceiptSettings } from "../../open-api";
import { quickScanAsksForNote } from "./quick-scan-field-config";

function settings(overrides: Partial<GroupReceiptSettings> = {}): GroupReceiptSettings {
  return {
    quickScanNoteEnabled: false,
    hideNote: false,
    ...overrides,
  } as GroupReceiptSettings;
}

describe("quickScanAsksForNote", () => {
  it("asks for nothing until a household is picked", () => {
    expect(quickScanAsksForNote(undefined, false)).toBe(false);
    // The early return is unconditional: settings never bring the field back while no household is picked.
    expect(quickScanAsksForNote(settings({ quickScanNoteEnabled: true }), false)).toBe(false);
  });

  it("asks for nothing when the household has no settings in the store", () => {
    // A stored default household the store cannot resolve is still a choice; it gets the server's default (off).
    expect(quickScanAsksForNote(undefined, true)).toBe(false);
  });

  it("is off unless the household switched it on", () => {
    expect(quickScanAsksForNote(settings(), true)).toBe(false);
    expect(quickScanAsksForNote(settings({ quickScanNoteEnabled: true }), true)).toBe(true);
  });

  it("stays hidden while the household hides the note, whatever the switch says", () => {
    expect(quickScanAsksForNote(settings({ quickScanNoteEnabled: true, hideNote: true }), true)).toBe(false);
  });
});
