/**
 * Diagnostic: streaming-read the P2P file and dump rows 8..14 verbatim so we
 * can see exactly which cells hold the header text and where data begins.
 * Pass the file path as argv[2].
 *
 *   node scripts/diag-headers.js "C:\path\to\P2P_master.xlsx"
 */
const ExcelJS = require('exceljs');
const path = require('path');

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node scripts/diag-headers.js <path-to-xlsx>');
  process.exit(1);
}

(async () => {
  const wb = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    sharedStrings: 'cache',
    worksheets: 'emit',
    hyperlinks: 'ignore',
  });

  for await (const ws of wb) {
    console.log(`\n--- sheet: ${ws.name} ---`);
    let n = 0;
    for await (const row of ws) {
      n++;
      if (n < 8 || n > 14) continue;
      const arr = Array.isArray(row.values) ? row.values : [];
      const cells = [];
      for (let i = 1; i < arr.length; i++) {
        let v = arr[i];
        if (v && typeof v === 'object') {
          if ('text' in v) v = v.text;
          else if ('result' in v) v = v.result;
          else if ('richText' in v) v = v.richText.map((p) => p.text || '').join('');
        }
        if (v === null || v === undefined || v === '') continue;
        cells.push(`col${i}=${JSON.stringify(String(v))}`);
      }
      console.log(`row ${n} (${cells.length} non-empty cells):`);
      for (const c of cells) console.log('   ', c);
      if (n >= 14) break;
    }
    break;
  }
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
