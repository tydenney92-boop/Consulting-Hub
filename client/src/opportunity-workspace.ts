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

export const filterOpportunities = (items: any[], filters: any, now = new Date()) => items.filter(item => {
  const haystack = [item.company?.name, item.roleTitle, item.location, item.office?.city, item.office?.region].filter(Boolean).join(' ').toLowerCase();
  const archived = item.status === 'CLOSED';
  const expired = deadlineState(item.applicationDeadline, now) === 'passed';
  const activity = filters.activity ?? 'active';
  return (!filters.q || haystack.includes(filters.q.toLowerCase()))
    && (!filters.stage || opportunityStage(item) === filters.stage)
    && (!filters.priority || item.priority === filters.priority)
    && (activity === '' || (activity === 'archived' ? archived : activity === 'expired' ? !archived && expired : !archived && !expired))
    && (!filters.deadline || deadlineState(item.applicationDeadline, now) === filters.deadline);
});
