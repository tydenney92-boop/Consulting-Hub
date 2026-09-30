import {strict as assert} from 'node:assert';
import {deadlineState, filterOpportunities, opportunityStage} from './opportunity-workspace';

const now = new Date('2026-09-27T12:00:00');
const rows = [
  {id:'target',company:{name:'Bain'},roleTitle:'Associate',priority:'HIGH',status:'TARGET',applicationDeadline:'2026-09-27'},
  {id:'applied',company:{name:'BCG'},roleTitle:'Summer Associate',priority:'MEDIUM',status:'READY_TO_APPLY',applications:[{currentStage:'APPLIED'}],applicationDeadline:'2026-09-30'},
  {id:'closed',company:{name:'Deloitte'},roleTitle:'Analyst',priority:'LOW',status:'CLOSED',applicationDeadline:'2026-09-20'}
];
assert.equal(deadlineState('2026-09-20', now), 'passed');
assert.equal(deadlineState('2026-09-27', now), 'today');
assert.equal(deadlineState('2026-09-30', now), 'soon');
assert.equal(opportunityStage(rows[1]), 'APPLIED');
assert.deepEqual(filterOpportunities(rows,{q:'',stage:'',priority:'',activity:'active',deadline:''},now).map(x=>x.id), ['target','applied']);
assert.deepEqual(filterOpportunities(rows,{q:'',stage:'APPLIED',priority:'',activity:'',deadline:''},now).map(x=>x.id), ['applied']);
assert.deepEqual(filterOpportunities(rows,{q:'',stage:'',priority:'',activity:'archived',deadline:'passed'},now).map(x=>x.id), ['closed']);
console.log('✓ Opportunity filtering and deadline-state behavior verified.');
