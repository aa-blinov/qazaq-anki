import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFile } from 'node:fs/promises';

const file = process.argv[2];
const data = await getDocument({ data: new Uint8Array(await readFile(file)) }).promise;
console.log(`Pages: ${data.numPages}`);

// Look at pages 10-25 — the vocabulary tables
for (let i = 10; i <= Math.min(25, data.numPages); i++) {
  const page = await data.getPage(i);
  const text = await page.getTextContent();
  const items = text.items.map((it) => it.str).join(' | ');
  console.log(`\n=== Page ${i} ===\n${items.slice(0, 2200)}`);
}
