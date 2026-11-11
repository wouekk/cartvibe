/**
 * The longest note a receipt takes, in characters. Mirrors the server's `models.MaxReceiptNoteLength`, so a note
 * that is too long is caught under the field instead of coming back as a refused save. Count it with
 * `codePointMaxLengthValidator`: the server counts characters, not UTF-16 units.
 */
export const RECEIPT_NOTE_MAX_LENGTH = 10000;
