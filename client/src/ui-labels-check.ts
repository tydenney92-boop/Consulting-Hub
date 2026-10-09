import assert from 'node:assert/strict';
import { optionLabel } from './ui-labels';

for (const [value, expected] of Object.entries({ FIRST_ROUND: 'First Round', FINAL_ROUND: 'Final Round', PREPARING_APPLICATION: 'Preparing Application', IN_PERSON: 'In Person', RECRUITER_SCREEN: 'Recruiter Screen', PENDING: 'Pending', HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low', READY_TO_APPLY: 'Ready To Apply' })) {
  assert.equal(optionLabel(value), expected);
  const option = { value, label: optionLabel(value) };
  assert.equal(option.value, value, 'Display formatting must not change persisted enum values');
}
assert.equal(optionLabel(''), '');
console.log('PASS readable stage/format/outcome/priority labels and unchanged option values');
