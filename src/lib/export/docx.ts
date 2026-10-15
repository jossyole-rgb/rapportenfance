import "server-only";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { CONFIDENTIAL_FOOTER, DRAFT_MARK, type ExportModel } from "./model";

const RED = "B91C1C";
const MUTED = "64748B";

export async function renderDocx(model: ExportModel): Promise<Buffer> {
  const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const metaTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder },
    rows: model.meta.map(
      ([label, value]) =>
        new TableRow({
          children: [
            new TableCell({ width: { size: 30, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, color: MUTED, size: 18 })] })] }),
            new TableCell({
              width: { size: 70, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ children: [new TextRun({ text: value, size: 18, color: label === "Statut" && model.draft ? RED : undefined, bold: label === "Statut" && model.draft })] })],
            }),
          ],
        }),
    ),
  });

  const body: Array<Paragraph | Table> = [
    ...model.header.map((line, i) => new Paragraph({ children: [new TextRun({ text: line, bold: i === 0, size: i === 0 ? 22 : 18, color: i === 0 ? undefined : MUTED })] })),
    new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1", space: 4 } }, children: [] }),
  ];
  if (model.draft) {
    body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 }, children: [new TextRun({ text: `${DRAFT_MARK} - DOCUMENT DE TRAVAIL`, bold: true, color: RED, size: 24 })] }));
  }
  body.push(new Paragraph({ heading: HeadingLevel.TITLE, spacing: { before: 240, after: 200 }, children: [new TextRun({ text: model.title })] }));
  body.push(metaTable);
  for (const section of model.sections) {
    body.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 320, after: 120 }, children: [new TextRun({ text: section.title })] }));
    for (const p of section.paragraphs) body.push(new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: p, size: 21 })] }));
  }
  body.push(new Paragraph({ spacing: { before: 360 }, children: [new TextRun({ text: model.validationStatement, italics: true, size: 17, color: model.draft ? RED : MUTED })] }));

  const doc = new Document({
    creator: "RapportEnfance IA",
    title: model.title,
    description: model.draft ? DRAFT_MARK : "Document validé",
    sections: [
      {
        headers: {
          default: new Header({
            children: model.draft
              ? [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: DRAFT_MARK, bold: true, color: RED, size: 18 })] })]
              : [],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: CONFIDENTIAL_FOOTER + "   -   Page ", size: 15, color: MUTED }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 15, color: MUTED }),
                  new TextRun({ text: " / ", size: 15, color: MUTED }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 15, color: MUTED }),
                ],
              }),
            ],
          }),
        },
        children: body,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
