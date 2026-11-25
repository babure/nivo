import PDFDocument from "pdfkit";
import { writeBinaryBlob } from "./storage.js";

export type TermsPdfInput = {
  fullName: string;
  email: string;
  version: string;
  title: string;
  acceptedAt: Date;
};

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Build Terms acceptance PDF bytes (no I/O). */
export function buildTermsAcceptancePdfBuffer(input: TermsPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 56, bottom: 72, left: 56, right: 56 },
      info: {
        Title: `Terms acceptance ${input.version}`,
        Author: "NIVO",
        Subject: "Accepted Terms of Service",
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;

    doc.font("Helvetica-Bold").fontSize(20).fillColor("#111111").text("NIVO", left, 48);
    doc.font("Helvetica").fontSize(10).fillColor("#666666").text("Terms acceptance record", left, 74);

    doc.moveDown(2);
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#111111").text(input.title || "Terms of Service");
    doc.moveDown(0.5);
    doc.font("Helvetica").fontSize(11).fillColor("#333333");
    doc.text(`Version: ${input.version}`);
    doc.text(`Accepted at: ${formatDate(input.acceptedAt)} (UTC date)`);
    doc.text(`Account: ${input.fullName} <${input.email}>`);
    doc.moveDown();
    doc.text(
      "This PDF confirms that you accepted the published Terms version above while signed in to NIVO. The full Terms text is available in your account and on the public Terms page. This is a provisional record pending counsel-approved wording.",
      { width: 480 },
    );
    doc.moveDown();
    doc.fontSize(9).fillColor("#888888").text("Draft for counsel review — replace before go-live.");

    doc.end();
  });
}

export async function writeTermsAcceptancePdf(input: TermsPdfInput): Promise<string> {
  const body = await buildTermsAcceptancePdfBuffer(input);
  const relKey = `terms/${input.email.replace(/[^a-z0-9]/gi, "_")}-${input.version}-${Date.now()}.pdf`;
  await writeBinaryBlob(relKey, body, "application/pdf");
  return relKey;
}
