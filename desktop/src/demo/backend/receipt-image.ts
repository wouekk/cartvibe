import { Receipt, ReceiptProduct } from "../../open-api";

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char] ?? char);
}

/**
 * A drawn receipt for a sample receipt, as a data URL the `<img>` shows directly. The demo has no photographs, so the
 * picture is generated from the receipt's own shop, lines and total. The colours are literal because the picture is
 * paper, not interface: it stays white in both themes.
 */
export function receiptImageDataUrl(receipt: Receipt, products: ReceiptProduct[]): string {
  const rows = products.slice(0, 14);
  const height = 150 + rows.length * 22 + 70;
  const lines = rows
    .map(
      (product, index) =>
        `<text x="24" y="${130 + index * 22}" font-size="13">${escapeXml(product.displayName || product.name)}</text>` +
        `<text x="296" y="${130 + index * 22}" font-size="13" text-anchor="end">${escapeXml(product.amount ?? "")}</text>`,
    )
    .join("");

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="${height}" viewBox="0 0 320 ${height}" font-family="monospace">` +
    `<rect width="320" height="${height}" fill="#ffffff"/>` +
    `<text x="160" y="40" font-size="18" font-weight="bold" text-anchor="middle" fill="#1a1a1a">${escapeXml(receipt.shopName ?? receipt.name)}</text>` +
    `<text x="160" y="62" font-size="11" text-anchor="middle" fill="#555555">Sample receipt, drawn by the demo</text>` +
    `<text x="24" y="92" font-size="12" fill="#555555">${escapeXml(receipt.date.slice(0, 10))}</text>` +
    `<line x1="24" y1="104" x2="296" y2="104" stroke="#999999" stroke-dasharray="4 3"/>` +
    `<g fill="#1a1a1a">${lines}</g>` +
    `<line x1="24" y1="${height - 52}" x2="296" y2="${height - 52}" stroke="#999999" stroke-dasharray="4 3"/>` +
    `<text x="24" y="${height - 26}" font-size="15" font-weight="bold" fill="#1a1a1a">TOTAL</text>` +
    `<text x="296" y="${height - 26}" font-size="15" font-weight="bold" text-anchor="end" fill="#1a1a1a">${escapeXml(receipt.amount)}</text>` +
    `</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
