import "server-only";
import PDFDocument from "pdfkit";
import { CONFIDENTIAL_FOOTER, DRAFT_MARK, type ExportModel } from "./model";

// Les polices standard PDF utilisent l'encodage WinAnsi : on remplace les caractères non représentables.
const WINANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
function safe(text: string): string {
  return [...text]
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (code === 0x09 || code === 0x0a || (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WINANSI_EXTRA.includes(ch)) return ch;
      if (ch === " " || ch === " ") return " ";
      return "?";
    })
    .join("");
}

const COLORS = { ink: "#1e293b", muted: "#64748b", accent: "#1d4ed8", line: "#cbd5e1", draft: "#b91c1c" };

export function renderPdf(model: ExportModel): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 60, bottom: 70, left: 60, right: 60 },
      bufferPages: true,
      info: { Title: safe(model.title), Producer: "RapportEnfance IA", Creator: "RapportEnfance IA" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const width = doc.page.width - 120;

    // En-tête institutionnel
    model.header.forEach((line, i) => {
      doc.font(i === 0 ? "Helvetica-Bold" : "Helvetica").fontSize(i === 0 ? 11 : 9).fillColor(i === 0 ? COLORS.ink : COLORS.muted).text(safe(line), { width });
    });
    doc.moveDown(0.6).strokeColor(COLORS.line).lineWidth(1).moveTo(60, doc.y).lineTo(60 + width, doc.y).stroke();

    if (model.draft) {
      doc.moveDown(0.6).font("Helvetica-Bold").fontSize(11).fillColor(COLORS.draft).text(safe(`${DRAFT_MARK} - DOCUMENT DE TRAVAIL`), { width, align: "center" });
    }

    doc.moveDown(0.8).font("Helvetica-Bold").fontSize(18).fillColor(COLORS.ink).text(safe(model.title), { width });
    doc.moveDown(0.6);

    // Informations du rapport
    for (const [label, value] of model.meta) {
      const y = doc.y;
      doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.muted).text(safe(label), 60, y, { width: 140 });
      doc.font("Helvetica").fontSize(9).fillColor(label === "Statut" && model.draft ? COLORS.draft : COLORS.ink).text(safe(value), 205, y, { width: width - 145 });
      doc.y = Math.max(doc.y, y + 12);
    }
    doc.x = 60;
    doc.moveDown(0.8);

    for (const section of model.sections) {
      if (doc.y > doc.page.height - 140) doc.addPage();
      doc.font("Helvetica-Bold").fontSize(12).fillColor(COLORS.accent).text(safe(section.title), 60, doc.y, { width });
      doc.moveDown(0.3);
      for (const p of section.paragraphs) {
        doc.font("Helvetica").fontSize(10.5).fillColor(COLORS.ink).text(safe(p), { width, align: "left", lineGap: 2 });
        doc.moveDown(0.35);
      }
      doc.moveDown(0.5);
    }

    doc.moveDown(0.5).font("Helvetica-Oblique").fontSize(8.5).fillColor(model.draft ? COLORS.draft : COLORS.muted).text(safe(model.validationStatement), { width });

    // Filigrane, pied de page et pagination sur chaque page
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 45;
      const savedBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      if (model.draft) {
        doc.save();
        doc.rotate(-35, { origin: [doc.page.width / 2, doc.page.height / 2] });
        doc.font("Helvetica-Bold").fontSize(54).fillColor(COLORS.draft).opacity(0.12)
          .text(safe(DRAFT_MARK), 0, doc.page.height / 2 - 30, { width: doc.page.width, align: "center", lineBreak: false });
        doc.restore();
        doc.opacity(1);
      }
      doc.font("Helvetica").fontSize(7.5).fillColor(COLORS.muted)
        .text(safe(CONFIDENTIAL_FOOTER), 60, bottom, { width: width - 60, lineBreak: false })
        .text(`Page ${i + 1} / ${range.count}`, 60 + width - 60, bottom, { width: 60, align: "right", lineBreak: false });
      if (model.draft) {
        doc.font("Helvetica-Bold").fontSize(7.5).fillColor(COLORS.draft).text(safe(DRAFT_MARK), 60, 30, { width, align: "right", lineBreak: false });
      }
      doc.page.margins.bottom = savedBottom;
    }
    doc.end();
  });
}
