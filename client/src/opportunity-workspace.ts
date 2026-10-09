export const deadlineState = (value?: string, now = new Date()) => {
  if (!value) return 'none';
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const dateOnly = value.slice(0, 10).split('-').map(Number);
  const deadline = dateOnly.length === 3 && dateOnly.every(Number.isFinite)
    ? new Date(dateOnly[0], dateOnly[1] - 1, dateOnly[2])
    : new Date(value);
  deadline.setHours(0, 0, 0, 0);
  const days = Math.round((deadline.getTime() - today.getTime()) / 86400000);
  if (days < 0) return 'passed';
  if (days === 0) return 'today';
  if (days <= 7) return 'soon';
  return 'normal';
};

export const opportunityStage = (item: any) => item.applications?.[0]?.currentStage || item.status || 'TARGET';

const seasonLabel = (value?: string | null) => (value || '').trim().replace(/\s+/g, ' ');
export const seasonKey = (value?: string | null) => seasonLabel(value) ? `season:${seasonLabel(value).toLowerCase()}` : 'missing';
export const recruitingPeriods = [
  {value:'period:fall', label:'Fall · September–December', name:'Fall'},
  {value:'period:winter', label:'Winter · January–April', name:'Winter'},
  {value:'period:spring-summer', label:'Spring/Summer · May–August', name:'Spring/Summer'}
] as const;
export const recruitingPeriod = (value?: string | null) => {
  const words = seasonLabel(value).toLowerCase().match(/(?:^|[^a-z])(fall|autumn|winter|spring|summer)(?=$|[^a-z])/g) || [];
  const periods = new Set(words.map(word => /fall|autumn/.test(word) ? 'period:fall' : /winter/.test(word) ? 'period:winter' : 'period:spring-summer'));
  return periods.size === 1 ? [...periods][0] : undefined;
};
export const recruitingSeasons = (items: any[]) => {
  const seasons = new Map<string, string>();
  for (const item of items) {
    const label = seasonLabel(item.recruitingSeason);
    if (label && !recruitingPeriod(label) && !seasons.has(seasonKey(label))) seasons.set(seasonKey(label), label);
  }
  return [...recruitingPeriods, ...[...seasons].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'en', { numeric: true }))];
};

export const filterOpportunities = (items: any[], filters: any, now = new Date()) => items.filter(item => {
  const haystack = [item.company?.name, item.roleTitle, item.location, item.office?.city, item.office?.region].filter(Boolean).join(' ').toLowerCase();
  const archived = item.status === 'CLOSED';
  const expired = deadlineState(item.applicationDeadline, now) === 'passed';
  const activity = filters.activity ?? 'active';
  return (!filters.q || haystack.includes(filters.q.toLowerCase()))
    && (!filters.stage || opportunityStage(item) === filters.stage)
    && (!filters.priority || item.priority === filters.priority)
    && (!filters.season || (filters.season.startsWith('period:') ? recruitingPeriod(item.recruitingSeason) === filters.season : seasonKey(item.recruitingSeason) === filters.season))
    && (activity === '' || (activity === 'archived' ? archived : activity === 'expired' ? !archived && expired : !archived && !expired))
    && (!filters.deadline || deadlineState(item.applicationDeadline, now) === filters.deadline);
});
