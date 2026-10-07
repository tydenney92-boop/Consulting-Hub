import React, { useRef, useState } from 'react';
import { Download, FileSpreadsheet, Upload, X } from 'lucide-react';

const fields = [
  ['company', 'Company'], ['roleTitle', 'Role title'], ['location', 'Location / office'], ['deadline', 'Application deadline'],
  ['jobUrl', 'Job / application URL'], ['requisitionId', 'Requisition ID'], ['eligibility', 'Eligibility'], ['compensation', 'Compensation'],
  ['employmentType', 'Employment type'], ['recruitingSeason', 'Recruiting season'], ['priority', 'Priority'], ['notes', 'Notes']
] as const;
type Preview = { id: string; fileName: string; sheetName: string; headers: string[]; mapping: Record<string, string>; revision: number; sheets: { name: string; rowCount: number; headers: string[]; suggestedMapping: Record<string, string> }[]; rows: any[] };

async function uploadFile(file: File) {
  const form = new FormData(); form.append('file', file);
  const response = await fetch('/api/opportunity-imports', { method: 'POST', credentials: 'include', body: form }), body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Unable to preview this spreadsheet.'); return body;
}

export function OpportunityImport({ api, refresh, onNotice }: { api: (path: string, options?: RequestInit) => Promise<any>; refresh: () => Promise<void> | void; onNotice: (message: string) => void }) {
  const input = useRef<HTMLInputElement>(null), [open, setOpen] = useState(false), [preview, setPreview] = useState<Preview | null>(null), [mapping, setMapping] = useState<Record<string, string>>({}), [decisions, setDecisions] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const setPreviewState = (next: Preview) => { setPreview(next); setMapping(next.mapping || {}); setDecisions(Object.fromEntries(next.rows.map(row => [row.id, row.defaultDecision]))); };
  const choose = async (file?: File) => { if (!file) return; setOpen(true); setBusy(true); setError(''); try { setPreviewState(await uploadFile(file)); } catch (e: any) { setError(e.message); } finally { setBusy(false); if (input.current) input.current.value = ''; } };
  const close = async () => { if (preview) await api(`/opportunity-imports/${preview.id}`, { method: 'DELETE' }).catch(() => {}); setOpen(false); setPreview(null); setError(''); };
  const remap = async (sheetName = preview?.sheetName, nextMapping = mapping) => { if (!preview || !sheetName) return; setBusy(true); setError(''); try { setPreviewState(await api(`/opportunity-imports/${preview.id}`, { method: 'PATCH', body: JSON.stringify({ revision: preview.revision, sheetName, mapping: nextMapping }) })); } catch (e: any) { setError(e.message); } finally { setBusy(false); } };
  const chooseSheet = (name: string) => { const sheet = preview?.sheets.find(x => x.name === name); if (sheet) { const next = sheet.suggestedMapping || {}; setMapping(next); remap(name, next); } };
  const commit = async () => { if (!preview) return; const selected = preview.rows.filter(row => (decisions[row.id] || row.defaultDecision) !== 'SKIP').length; if (!selected) return setError('Choose at least one row to create or update.'); if (!confirm(`Import ${selected} selected ${selected === 1 ? 'row' : 'rows'} as opportunities?`)) return; setBusy(true); setError(''); try { const result = await api(`/opportunity-imports/${preview.id}/commit`, { method: 'POST', body: JSON.stringify({ revision: preview.revision, rows: preview.rows.map(row => ({ id: row.id, decision: decisions[row.id] || row.defaultDecision })) }) }); await refresh(); onNotice(`Import complete: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped.`); setPreview(null); setOpen(false); } catch (e: any) { setError(e.message); } finally { setBusy(false); } };
  const mappingChanged = !!preview && JSON.stringify(mapping) !== JSON.stringify(preview.mapping);
  const currentSheet = preview?.sheets.find(x => x.name === preview.sheetName), selectedCount = preview?.rows.filter(row => !row.error && (decisions[row.id] || row.defaultDecision) !== 'SKIP').length || 0;
  return <>
    <input ref={input} className="sr-only" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event => choose(event.target.files?.[0])}/>
    <button className="secondary" onClick={() => input.current?.click()}><Upload size={15}/> Import opportunities</button>
    {open && <div className="overlay" role="presentation"><section className="modal import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <button className="icon close" aria-label="Close import" disabled={busy} onClick={close}><X size={18}/></button>
      <p className="eyebrow">SPREADSHEET IMPORT</p><h2 id="import-title">Review opportunities before importing</h2>
      {!preview && <div className="import-loading"><FileSpreadsheet size={28}/><p>{busy ? 'Reading spreadsheet safely…' : 'Choose a CSV or XLSX file to begin.'}</p>{!busy && <button className="primary" onClick={() => input.current?.click()}>Choose file</button>}</div>}
      {error && <p className="notice" role="alert">{error}</p>}
      {preview && <>
        <div className="import-summary"><div><strong>{preview.fileName}</strong><span>{preview.rows.length} data rows detected</span></div><a className="secondary" href="/api/opportunity-imports/template.csv"><Download size={14}/> CSV template</a></div>
        <div className="import-controls"><label>Source sheet<select disabled={busy} value={preview.sheetName} onChange={e => chooseSheet(e.target.value)}>{preview.sheets.filter(sheet => !['hub inventory', 'location applications'].includes(sheet.name.trim().toLowerCase())).map(sheet => <option key={sheet.name} value={sheet.name}>{sheet.name} ({sheet.rowCount} rows)</option>)}</select></label><button className="secondary" disabled={busy} onClick={() => remap()}>Apply column mapping</button></div>
        <details className="import-mapping"><summary>Review column mapping</summary><div className="import-map-grid">{fields.map(([field, label]) => <label key={field}>{label}{(field === 'company' || field === 'roleTitle') && ' *'}<select value={mapping[field] || ''} onChange={e => setMapping({ ...mapping, [field]: e.target.value })}><option value="">Not mapped</option>{(currentSheet?.headers || preview.headers).map(header => <option value={header} key={header}>{header}</option>)}</select></label>)}</div></details>
        <div className="import-table-wrap"><table className="import-table"><thead><tr><th>Decision</th><th>Company / role</th><th>Location</th><th>Deadline</th><th>Match result</th></tr></thead><tbody>{preview.rows.map(row => { const data = row.data || {}, decision = decisions[row.id] || row.defaultDecision; return <tr key={row.id} className={row.error ? 'import-error' : ''}><td><select aria-label={`Decision for row ${row.rowNumber}`} value={decision} disabled={!!row.error} onChange={e => setDecisions({ ...decisions, [row.id]: e.target.value })}><option value="CREATE">Create</option>{row.matchedOpportunityId && <option value="UPDATE">Update match</option>}<option value="SKIP">Skip</option></select></td><td><strong>{data.company || 'Missing company'}</strong><span>{data.roleTitle || 'Missing role'} · row {row.rowNumber}</span></td><td>{data.location || '—'}</td><td>{data.deadlineDate || (data.deadlineType === 'ROLLING' ? 'Rolling' : data.deadlineType === 'PRIORITY' ? 'Priority' : 'Unknown')}</td><td><span className={`import-outcome ${row.outcome.toLowerCase()}`}>{row.outcome.replaceAll('_', ' ')}</span>{row.error && <small>{row.error}</small>}</td></tr>; })}</tbody></table></div>
        <p className="import-footnote">Exact and possible matches are skipped by default. Updates never reset an application stage or replace linked contacts, documents, applications, or existing notes.</p>
        {mappingChanged && <p role="status" className="import-footnote">Apply your column mapping to refresh the preview before importing.</p>}
        <div className="modal-actions"><button className="secondary" disabled={busy} onClick={close}>Cancel import</button><button className="primary" disabled={busy || mappingChanged || !selectedCount} onClick={commit}>{busy ? 'Working…' : `Import ${selectedCount} selected`}</button></div>
      </>}
    </section></div>}
  </>;
}
