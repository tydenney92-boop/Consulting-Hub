export type TodayActionKind = 'task' | 'contact' | 'opportunity' | 'application' | 'interview';

export const actionPage = (kind: TodayActionKind) => {
  if (kind === 'task') return 'Tasks';
  if (kind === 'contact') return 'Networking';
  if (kind === 'application') return 'Applications';
  if (kind === 'interview') return 'Interviews';
  return 'Opportunities';
};
