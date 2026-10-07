import { strict as assert } from 'node:assert';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import { parseDeadline, canonicalUrl } from './opportunity-import.js';

const folder = mkdtempSync(join(tmpdir(), 'opportunity-import-')), database = join(folder, 'test.db'), port = 4387, base = `http://127.0.0.1:${port}`;
const schema = spawnSync('npx', ['prisma', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'], { encoding: 'utf8' });
assert.equal(schema.status, 0, schema.stderr); assert.equal(spawnSync('sqlite3', [database], { input: schema.stdout, encoding: 'utf8' }).status, 0);
const server = spawn('node', ['server/dist/index.js'], { env: { ...process.env, DATABASE_URL: `file:${database}`, PORT: String(port), NODE_ENV: 'development', UPLOAD_DIR: join(folder, 'uploads') }, stdio: ['ignore', 'pipe', 'pipe'] });
let errors = ''; server.stderr.on('data', value => errors += value);
const json = async (path: string, cookie = '', method = 'GET', body?: any, status = 200) => { const response = await fetch(base + '/api' + path, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) }); assert.equal(response.status, status, `${method} ${path}: ${await response.clone().text()}`); return response.status === 204 ? null : response.json(); };
const register = async (email: string) => { const response = await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Import QA', email, password: 'Import-QA-password-2026!' }) }); assert.equal(response.status, 201); return response.headers.get('set-cookie')!.split(';')[0]; };
const upload = async (cookie: string, contents: string | Buffer, name: string, type: string, status = 201) => { const form = new FormData(), part: BlobPart = typeof contents === 'string' ? contents : Uint8Array.from(contents); form.append('file', new Blob([part], { type }), name); const response = await fetch(base + '/api/opportunity-imports', { method: 'POST', headers: { cookie }, body: form }); assert.equal(response.status, status, await response.clone().text()); return response.json(); };

try {
  for (let attempt = 0; attempt < 80; attempt++) { try { if ((await fetch(base + '/api/health')).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
  assert.deepEqual(parseDeadline(45567), { deadlineType: 'DATE', deadlineDate: '2024-10-02' });
  assert.equal(parseDeadline('Rolling').deadlineType, 'ROLLING'); assert.equal(parseDeadline('Priority deadline').deadlineType, 'PRIORITY');
  assert.equal(canonicalUrl('https://www.example.com/jobs/1/?utm_source=test#apply'), 'https://example.com/jobs/1');
  const a = await register('import-a@example.test'), b = await register('import-b@example.test');
  const csv = [
    'Company,Role title,Location,Application deadline,Job URL,Requisition ID,Eligibility,Compensation,Employment type,Recruiting season,Priority,Notes',
    'Synthetic Strategy Co,Strategy Intern,Dallas TX,2027-01-15,https://example.com/jobs/1?utm_source=sheet,REQ-1,Juniors,$25/hour,INTERNSHIP,Summer 2027,HIGH,Imported context',
    'Synthetic Strategy Co,Strategy Intern,New York NY,Rolling,https://example.com/jobs/2,REQ-2,Juniors,$25/hour,INTERNSHIP,Summer 2027,MEDIUM,Second office'
  ].join('\n');
  const preview = await upload(a, csv, 'opportunities.csv', 'text/csv'); assert.equal(preview.rows.length, 2); assert.equal(preview.sheetName, 'sheet1'); assert(preview.rows.every((row: any) => row.defaultDecision === 'CREATE'));
  await json(`/opportunity-imports/${preview.id}`, b, 'GET', undefined, 404);
  await json(`/opportunity-imports/${preview.id}/commit`, b, 'POST', { revision: preview.revision, rows: [] }, 404);
  const committed: any = await json(`/opportunity-imports/${preview.id}/commit`, a, 'POST', { revision: preview.revision, rows: preview.rows.map((row: any) => ({ id: row.id, decision: 'CREATE' })) }); assert.equal(committed.created, 2);
  const opportunities: any = await json('/opportunities?includeConverted=true', a); assert.equal(opportunities.length, 2); assert.deepEqual(new Set(opportunities.map((x: any) => x.location)), new Set(['Dallas TX', 'New York NY']));
  const repeated = await json(`/opportunity-imports/${preview.id}/commit`, a, 'POST', { revision: preview.revision, rows: [] }); assert.equal(repeated.alreadyCommitted, true); assert.equal((await json('/opportunities?includeConverted=true', a) as any).length, 2);
  const duplicate = await upload(a, csv, 'opportunities-again.csv', 'text/csv'); assert(duplicate.rows.every((row: any) => row.outcome === 'EXACT_MATCH' && row.defaultDecision === 'SKIP'));
  const first = opportunities.find((x: any) => x.requisitionId === 'REQ-1'); await json(`/opportunities/${first.id}/application`, a, 'POST', {}, 201); await json(`/opportunities/${first.id}/applied`, a, 'POST', {});
  const changedCsv = csv.replace('2027-01-15', '2027-02-01').replace('Imported context', 'New imported context'); const changed = await upload(a, changedCsv, 'changed.csv', 'text/csv'); const changedRow = changed.rows.find((row: any) => row.data.requisitionId === 'REQ-1');
  await json(`/opportunity-imports/${changed.id}/commit`, a, 'POST', { revision: changed.revision, rows: changed.rows.map((row: any) => ({ id: row.id, decision: row.id === changedRow.id ? 'UPDATE' : 'SKIP' })) });
  const detail: any = await json(`/opportunities/${first.id}`, a); assert.equal(detail.applications[0].currentStage, 'APPLIED'); assert.match(detail.notes, /Imported context/); assert.match(detail.notes, /New imported context/); assert.equal(detail.applicationDeadline.slice(0, 10), '2027-02-01');
  const stale = await upload(a, changedCsv, 'stale.csv', 'text/csv'); const staleRow = stale.rows.find((row: any) => row.data.requisitionId === 'REQ-1'); await json(`/opportunities/${first.id}`, a, 'PATCH', { priority: 'LOW' }); await json(`/opportunity-imports/${stale.id}/commit`, a, 'POST', { revision: stale.revision, rows: stale.rows.map((row: any) => ({ id: row.id, decision: row.id === staleRow.id ? 'UPDATE' : 'SKIP' })) }, 409);
  const workbook = new ExcelJS.Workbook(); const inventory = workbook.addWorksheet('Hub inventory'); inventory.addRow(['Company', 'Role title']); inventory.addRow(['Do not import', 'Inventory only']); const locations = workbook.addWorksheet('Location applications'); locations.addRow(['Company', 'Role title', 'Location', 'Application URL']); locations.addRow(['Workbook Strategy', 'Summer Analyst', 'Chicago', 'https://example.com/chicago']); const source = workbook.addWorksheet('Open opportunities'); source.addRow(['Company', 'Role title', 'Location', 'Application deadline', 'Requisition ID']); source.addRow(['Workbook Strategy', 'Summer Analyst', 'Boston', new Date('2027-03-03T12:00:00Z'), 'WB-1']);
  const xlsx = Buffer.from(await workbook.xlsx.writeBuffer()); const bookPreview = await upload(a, xlsx, 'multi-sheet.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); assert.equal(bookPreview.sheetName, 'Open opportunities'); assert.equal(bookPreview.rows.length, 1); assert.deepEqual(bookPreview.rows[0].data.supplemental, ['Chicago — https://example.com/chicago']);
  await upload(a, 'not a spreadsheet', 'legacy.xls', 'application/vnd.ms-excel', 400);
  await upload(a, 'not a zip archive', 'malformed.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 400);
  const compatibility = new ExcelJS.Workbook(), compatibilitySheet = compatibility.addWorksheet('Open opportunities');
  compatibilitySheet.getRow(2).getCell(1).value = 'Summer 2027 recruiting';
  compatibilitySheet.getRow(12).values = ['Company', 'Role', 'US locations', 'Graduation rule', 'Pay details', 'Application URL', 'My notes', 'Next step'];
  compatibilitySheet.getRow(13).values = ['Namespace QA', 'Strategy Intern', 'Dallas; Boston', 'Graduation 2028', '$30/hour', 'https://example.com/prefixed', 'Preserve this note', 'Review eligibility'];
  const prefixedZip = await JSZip.loadAsync(await compatibility.xlsx.writeBuffer());
  for (const entry of Object.values(prefixedZip.files)) if (entry.name.endsWith('.xml')) {
    let xml = await entry.async('string');
    if (xml.includes('xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"')) {
      xml = xml.replace('xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"', 'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"').replace(/<(\/?)([A-Za-z_][\w.-]*)(?=[\s/>])/g, '<$1x:$2');
      prefixedZip.file(entry.name, xml);
    }
  }
  const prefixedPreview = await upload(a, await prefixedZip.generateAsync({ type: 'nodebuffer' }), 'prefixed.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(prefixedPreview.rows.length, 1); assert.equal(prefixedPreview.rows[0].rowNumber, 13);
  assert.equal(prefixedPreview.rows[0].data.location, 'Dallas; Boston'); assert.equal(prefixedPreview.rows[0].data.eligibility, 'Graduation 2028'); assert.equal(prefixedPreview.rows[0].data.compensation, '$30/hour');
  assert.match(prefixedPreview.rows[0].data.notes, /Next step: Review eligibility/);
  if (process.env.IMPORT_TEST_WORKBOOK) {
    const realPreview = await upload(a, await readFile(process.env.IMPORT_TEST_WORKBOOK), 'comparison.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    assert.equal(realPreview.sheetName, 'Open opportunities'); assert.equal(realPreview.headerRow, 11);
    assert(realPreview.rows.length > 0); assert(realPreview.rows.every((row: any) => row.data.company && row.data.roleTitle));
    assert(realPreview.rows[0].data.location); assert(realPreview.rows[0].data.notes);
    console.log(`✓ Supplied comparison workbook: ${realPreview.rows.length} opportunity rows previewed through the authenticated upload endpoint.`);
  }
  const duplicateRows = await upload(b, csv + '\n' + csv.split('\n')[1], 'duplicates.csv', 'text/csv');
  assert.equal(duplicateRows.rows[2].outcome, 'DUPLICATE_ROW');
  const onlySelected = await json(`/opportunity-imports/${duplicateRows.id}/commit`, b, 'POST', { revision: duplicateRows.revision, rows: [{ id: duplicateRows.rows[0].id, decision: 'CREATE' }] });
  assert.equal(onlySelected.created, 1); assert.equal(onlySelected.skipped, 2);
  assert.equal((await json('/opportunities?includeConverted=true', b)).length, 1);
  await json(`/opportunity-imports/${bookPreview.id}`, a, 'PATCH', { revision: bookPreview.revision, sheetName: 'Hub inventory', mapping: { company: 'Company', roleTitle: 'Role title' } }, 400);
  await json(`/opportunity-imports/${bookPreview.id}/commit`, a, 'POST', { revision: 999, rows: [] }, 409);
  await json(`/opportunity-imports/${duplicate.id}`, a, 'DELETE', undefined, 204); await json(`/opportunity-imports/${duplicate.id}`, a, 'GET', undefined, 404);
  assert.equal(errors, ''); console.log('✓ Spreadsheet parsing, mapping, ownership, duplicate handling, idempotency, stale previews, date handling, and pipeline preservation passed.');
} finally { server.kill('SIGTERM'); await once(server, 'exit'); }
