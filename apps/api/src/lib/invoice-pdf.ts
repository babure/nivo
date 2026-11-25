import PDFDocument from "pdfkit";
import { writeBinaryBlob } from "./storage.js";

export type InvoicePdfInput = {
  number: string;
  fullName: string;
  email: string;
  amountCents: number;
  currency: string;
  issuedAt: Date;
  /** Optional payment reference (Stripe id / manual). */
  paymentRef?: string | null;
  /** Optional company / billing address lines for the header. */
  companyLines?: string[];
};

const BRAND = {
  name: "NIVO",
  tagline: "Study abroad service fee",
  email: "billing@nivo.app",
  website: "https://nivo.app",
  address: ["NIVO Operations", "Service fee invoices"],
};

function money(cents: number, currency: string): string {
  const code = currency.toUpperCase();
  const value = (cents / 100).toFixed(2);
  if (code === "EUR") return `€${value}`;
  if (code === "USD") return `$${value}`;
  if (code === "GBP") return `£${value}`;
  return `${code} ${value}`;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Build invoice PDF bytes (no I/O). */
export function buildInvoicePdfBuffer(input: InvoicePdfInput): Promise<Buffer> {
  const amountLabel = money(input.amountCents, input.currency);
  const issued = formatDate(input.issuedAt);
  const company = input.companyLines?.length ? input.companyLines : BRAND.address;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 56, bottom: 72, left: 56, right: 56 },
      info: {
        Title: `Invoice ${input.number}`,
        Author: BRAND.name,
        Subject: "NIVO service fee",
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width;
    const left = doc.page.margins.left;
    const right = pageWidth - doc.page.margins.right;
    const contentWidth = right - left;

    // —— Header ——
    doc
      .fillColor("#111111")
      .font("Helvetica-Bold")
      .fontSize(22)
      .text(BRAND.name, left, 48, { continued: false });
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#666666")
      .text(BRAND.tagline, left, 74);

    doc
      .font("Helvetica-Bold")
      .fontSize(18)
      .fillColor("#111111")
      .text("INVOICE", left, 48, { width: contentWidth, align: "right" });
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#444444")
      .text(`No. ${input.number}`, left, 72, { width: contentWidth, align: "right" })
      .text(`Issued ${issued}`, left, 84, { width: contentWidth, align: "right" });

    doc
      .moveTo(left, 110)
      .lineTo(right, 110)
      .strokeColor("#DDDDDD")
      .lineWidth(1)
      .stroke();

    // —— Parties ——
    let y = 128;
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#888888").text("FROM", left, y);
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#888888").text("BILL TO", left + contentWidth / 2, y);

    y += 14;
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#111111").text(BRAND.name, left, y);
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#111111").text(input.fullName, left + contentWidth / 2, y);

    y += 16;
    doc.font("Helvetica").fontSize(9).fillColor("#444444");
    let leftY = y;
    for (const line of company) {
      doc.text(line, left, leftY, { width: contentWidth / 2 - 12 });
      leftY += 12;
    }
    doc.text(BRAND.email, left, leftY);
    leftY += 12;
    doc.text(BRAND.website, left, leftY);

    let rightY = y;
    doc.text(input.email, left + contentWidth / 2, rightY, { width: contentWidth / 2 });
    rightY += 12;
    if (input.paymentRef) {
      doc.text(`Payment ref: ${input.paymentRef}`, left + contentWidth / 2, rightY, {
        width: contentWidth / 2,
      });
      rightY += 12;
    }

    y = Math.max(leftY, rightY) + 28;

    // —— Line items table ——
    const colDesc = left;
    const colQty = left + contentWidth * 0.58;
    const colAmount = right;

    doc.rect(left, y, contentWidth, 22).fill("#F5F5F5");
    doc
      .fillColor("#555555")
      .font("Helvetica-Bold")
      .fontSize(8)
      .text("DESCRIPTION", colDesc + 8, y + 7)
      .text("QTY", colQty, y + 7, { width: 40, align: "right" })
      .text("AMOUNT", colAmount - 80, y + 7, { width: 72, align: "right" });

    y += 28;
    doc
      .fillColor("#111111")
      .font("Helvetica")
      .fontSize(10)
      .text("NIVO service fee", colDesc + 8, y, { width: contentWidth * 0.55 })
      .text("1", colQty, y, { width: 40, align: "right" })
      .text(amountLabel, colAmount - 80, y, { width: 72, align: "right" });

    y += 18;
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#777777")
      .text(
        "Partner products (blocked account, insurance, accommodation) are billed separately by those providers.",
        colDesc + 8,
        y,
        { width: contentWidth * 0.7 },
      );

    y += 36;
    doc
      .moveTo(left + contentWidth * 0.55, y)
      .lineTo(right, y)
      .strokeColor("#DDDDDD")
      .stroke();

    y += 12;
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#444444")
      .text("Subtotal", colQty - 20, y, { width: 60, align: "right" })
      .fillColor("#111111")
      .text(amountLabel, colAmount - 80, y, { width: 72, align: "right" });

    y += 18;
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor("#111111")
      .text("Total paid", colQty - 20, y, { width: 60, align: "right" })
      .text(amountLabel, colAmount - 80, y, { width: 72, align: "right" });

    y += 36;

    // —— Payment details ——
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#888888").text("PAYMENT DETAILS", left, y);
    y += 14;
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#333333")
      .text(`Status: Paid`, left, y)
      .text(`Currency: ${input.currency.toUpperCase()}`, left, y + 12)
      .text(`Amount: ${amountLabel}`, left, y + 24)
      .text(`Invoice date: ${issued}`, left, y + 36);
    if (input.paymentRef) {
      doc.text(`Reference: ${input.paymentRef}`, left, y + 48);
    }
    doc
      .text(
        "Payment was collected via NIVO’s checkout. This invoice is a receipt for your records — no further action is required.",
        left,
        y + (input.paymentRef ? 64 : 52),
        { width: contentWidth },
      );

    // —— Footer on each page ——
    const footerY = doc.page.height - 48;
    doc
      .moveTo(left, footerY - 12)
      .lineTo(right, footerY - 12)
      .strokeColor("#EEEEEE")
      .lineWidth(0.75)
      .stroke();
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#999999")
      .text(
        `${BRAND.name} · ${BRAND.email} · ${BRAND.website}`,
        left,
        footerY - 4,
        { width: contentWidth * 0.7, align: "left" },
      )
      .text(`Invoice ${input.number}`, left, footerY - 4, {
        width: contentWidth,
        align: "right",
      });

    doc.end();
  });
}

/** Writes invoice PDF via ObjectStorage and returns the relative storage key. */
export async function writeInvoicePdf(input: InvoicePdfInput): Promise<string> {
  const relKey = `invoices/${input.number}.pdf`;
  const body = await buildInvoicePdfBuffer(input);
  await writeBinaryBlob(relKey, body, "application/pdf");
  return relKey;
}
