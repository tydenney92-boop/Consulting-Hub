import type { RecordKind } from './navigation';

export type SearchResult = { kind: RecordKind; id: string; title: string; context: string };
export function searchWorkspace(data: Record<string, any[]>, query: string): SearchResult[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const results: SearchResult[] = [];
  const add = (kind: RecordKind, record: any, title: string, context: string) => {
    if (record.id && words.every(word => `${title} ${context}`.toLocaleLowerCase().includes(word))) {
      results.push({ kind, id: record.id, title, context });
    }
  };
  for (const r of data.companies || []) add('company', r, r.name || 'Unnamed firm', 'Firm');
  for (const r of data.opportunities || []) add('opportunity', r, r.roleTitle || 'Opportunity', `Opportunity · ${r.company?.name || ''} · ${r.office?.city || r.location || ''}`);
  for (const r of data.applications || []) add('application', r, r.opportunity?.roleTitle || 'Application', `Application · ${r.opportunity?.company?.name || ''} · ${(r.currentStage || '').replaceAll('_', ' ')}`);
  for (const r of data.contacts || []) add('contact', r, `${r.firstName || ''} ${r.lastName || ''}`.trim(), `Contact · ${r.company?.name || ''} · ${r.email || ''}`);
  for (const r of data.tasks || []) add('task', r, r.title || 'Task', `Task · ${r.company?.name || ''}`);
  for (const r of data.documents || []) add('document', r, r.name || 'Document', 'Document');
  for (const r of data.interviews || []) add('interview', r, `${(r.interviewRound || 'Interview').replaceAll('_', ' ')} interview`, `Interview · ${r.application?.opportunity?.company?.name || r.company?.name || ''} · ${r.application?.opportunity?.roleTitle || ''}`);
  return results.sort((a, b) => Number(!a.title.toLocaleLowerCase().startsWith(words[0])) - Number(!b.title.toLocaleLowerCase().startsWith(words[0])) || a.title.localeCompare(b.title));
}
