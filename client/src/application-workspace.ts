import {safeExternalUrl} from './opportunity-detail-model';

export const terminalApplicationStages = new Set(['OFFER', 'REJECTED', 'WITHDRAWN', 'CLOSED']);

export function filterApplications(items: any[], query = '', lifecycle = 'active') {
  const needle = query.trim().toLowerCase();
  return items.filter(item => {
    const terminal = terminalApplicationStages.has(item.currentStage);
    const haystack = [
      item.opportunity?.company?.name,
      item.opportunity?.roleTitle,
      item.opportunity?.practiceArea,
      item.opportunity?.location,
      item.opportunity?.office?.city,
      item.opportunity?.office?.region,
      item.opportunity?.recruitingSeason,
      item.opportunity?.source,
    ].filter(Boolean).join(' ').toLowerCase();
    return (!needle || haystack.includes(needle))
      && (lifecycle === 'all' || (lifecycle === 'terminal' ? terminal : !terminal));
  });
}

export function applicationExternalLink(application: any) {
  const candidates = [
    [application?.applicationPortalUrl, 'Open application portal'],
    [application?.opportunity?.jobUrl, 'Open job posting'],
    [application?.opportunity?.company?.careersUrl, 'Open company careers'],
    [application?.opportunity?.company?.website, 'Open company website'],
  ];
  for (const [value, label] of candidates) {
    const href = safeExternalUrl(value as string | null | undefined);
    if (href) return {href, label};
  }
  return null;
}
