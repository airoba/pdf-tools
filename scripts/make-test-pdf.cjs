const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

async function main() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 4; i++) {
    const page = doc.addPage([595.28, 841.89]); // A4
    page.drawText("Test Page " + i, { x: 60, y: 760, size: 34, font, color: rgb(0, 0, 1) });
    page.drawText("This is page " + i + " for image export testing.", { x: 60, y: 720, size: 14, font });
  }
  const bytes = await doc.save();
  require("fs").writeFileSync("E:/103.local_project/docTools/小页匠/test-export.pdf", Buffer.from(bytes));
  console.log("created test-export.pdf");
}
main().catch((e) => { console.error(e); process.exit(1); });