/** The lengths of the barcodes on food: EAN-8, UPC-A (12) and EAN-13. */
const BARCODE_LENGTHS = [8, 12, 13];

/** Keeps the digits of what a person typed or a scanner read ("5 449000 000996" becomes "5449000000996"). */
export function digitsOnly(input: string): string {
  return input.replace(/\D/g, "");
}

/**
 * The GS1 check digit rule shared by EAN-8, UPC-A and EAN-13: from the right, the digit before the check digit is weighed
 * 3, the next 1, and so on, and the total plus the check digit must be a multiple of ten.
 */
export function hasValidCheckDigit(code: string): boolean {
  if (!/^\d+$/.test(code) || !BARCODE_LENGTHS.includes(code.length)) {
    return false;
  }

  const digits = code.split("").map(Number);
  const check = digits.pop() as number;
  let sum = 0;
  digits.reverse().forEach((digit, index) => {
    sum += digit * (index % 2 === 0 ? 3 : 1);
  });

  return (10 - (sum % 10)) % 10 === check;
}

/**
 * The barcode in an input, or null when it is a name to search for. Only a run of digits (spaces and dashes allowed) of a
 * barcode length with a correct check digit counts: "7up" or "12345" is a search.
 */
export function asBarcode(input: string): string | null {
  const trimmed = input.trim();
  if (!/^[\d\s-]+$/.test(trimmed)) {
    return null;
  }

  const code = digitsOnly(trimmed);

  return hasValidCheckDigit(code) ? code : null;
}
