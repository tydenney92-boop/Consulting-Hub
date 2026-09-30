export const opportunityPath = (id: string) => `#/opportunities/${encodeURIComponent(id)}`;
export function opportunityIdFromHash(hash: string) {
  const match = hash.match(/^#\/opportunities\/([^/]+)$/);
  try { return match ? decodeURIComponent(match[1]) : null; } catch { return null; }
}

export function safeExternalUrl(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function opportunityExternalLink(opportunity: any) {
  const candidates = [
    [opportunity.applications?.[0]?.applicationPortalUrl, 'Apply / View Job Posting'],
    [opportunity.jobUrl, 'Apply / View Job Posting'],
    [opportunity.company?.careersUrl, 'Company Careers'],
    [opportunity.company?.website, 'Company Website'],
  ];
  for (const [value, label] of candidates) {
    const href = safeExternalUrl(value);
    if (href) return { href, label };
  }
  return null;
}

export function relatedOpportunityAction(opportunity: any, actions: any[]) {
  if (opportunity.status === 'CLOSED') return null;
  const ids: Record<string, Set<string>> = {
    opportunity: new Set([opportunity.id]),
    contact: new Set((opportunity.contacts || []).map((x: any) => x.id)),
    application: new Set((opportunity.applications || []).map((x: any) => x.id)),
    interview: new Set((opportunity.interviews || []).filter((x: any) => !x.archivedAt).map((x: any) => x.id)),
    task: new Set((opportunity.tasks || []).map((x: any) => x.id)),
  };
  return actions.find(action => ids[action.kind]?.has(action.id)) || null;
}
