import {strict as assert} from 'node:assert';
import {deadlineState, filterOpportunities, opportunityStage, recruitingSeasons, seasonKey, recruitingPeriods, recruitingPeriod} from './opportunity-workspace';

const now = new Date('2026-09-27T12:00:00');
const rows = [
  {id:'target',company:{name:'Bain'},roleTitle:'Associate',priority:'HIGH',status:'TARGET',applicationDeadline:'2026-09-27'},
  {id:'applied',company:{name:'BCG'},roleTitle:'Summer Associate',priority:'MEDIUM',status:'READY_TO_APPLY',applications:[{currentStage:'APPLIED'}],applicationDeadline:'2026-09-30'},
  {id:'closed',company:{name:'Deloitte'},roleTitle:'Analyst',priority:'LOW',status:'CLOSED',applicationDeadline:'2026-09-20'}
];
assert.equal(deadlineState('2026-09-20', now), 'passed');
assert.equal(deadlineState('2026-09-27', now), 'today');
assert.equal(deadlineState('2026-09-30', now), 'soon');
assert.equal(deadlineState('2026-09-30', new Date('2026-09-30T23:59:59')), 'today');
assert.equal(deadlineState('2026-09-30', new Date('2026-10-01T00:00:00')), 'passed');
assert.equal(deadlineState(undefined, now), 'none');
const expired={...rows[1],id:'expired',applicationDeadline:'2026-09-20'};
assert.deepEqual(filterOpportunities([expired],{},now),[]);
assert.deepEqual(filterOpportunities([expired],{activity:'expired',stage:'APPLIED',priority:'MEDIUM',q:'BCG',deadline:'passed'},now),[expired]);
assert.deepEqual(filterOpportunities([expired,...rows],{activity:''},now),[expired,...rows]);
assert.deepEqual(filterOpportunities([expired],{activity:'archived'},now),[]);
assert.equal(opportunityStage(rows[1]), 'APPLIED');
assert.deepEqual(filterOpportunities(rows,{q:'',stage:'',priority:'',activity:'active',deadline:''},now).map(x=>x.id), ['target','applied']);
assert.deepEqual(filterOpportunities(rows,{q:'',stage:'APPLIED',priority:'',activity:'',deadline:''},now).map(x=>x.id), ['applied']);
assert.deepEqual(filterOpportunities(rows,{q:'',stage:'',priority:'',activity:'archived',deadline:'passed'},now).map(x=>x.id), ['closed']);
const seasonal = [
  {...rows[0], recruitingSeason:'Winter 2027'},
  {...rows[1], recruitingSeason:'Summer 2027'},
  {...rows[0], id:'winter-duplicate', recruitingSeason:'  winter   2027 '},
  {...rows[2], recruitingSeason:'Winter 2027'},
  {...rows[0], id:'unspecified', recruitingSeason:null},
  {...rows[0], id:'blank', recruitingSeason:'  '}
];
assert.deepEqual(recruitingSeasons(seasonal), recruitingPeriods);
assert.deepEqual(filterOpportunities(seasonal,{season:seasonKey('Winter 2027')},now).map(x=>x.id),['target','winter-duplicate']);
assert.deepEqual(filterOpportunities(seasonal,{season:seasonKey('Winter 2027'),activity:'archived'},now).map(x=>x.id),['closed']);
assert.deepEqual(filterOpportunities(seasonal,{season:seasonKey('Summer 2027'),stage:'APPLIED',priority:'MEDIUM',q:'BCG',deadline:'soon'},now).map(x=>x.id),['applied']);
assert.deepEqual(filterOpportunities(seasonal,{season:'missing'},now).map(x=>x.id),['unspecified','blank']);
assert.equal(filterOpportunities(seasonal,{season:seasonKey('Winter 2028')},now).length,0);
assert.equal(filterOpportunities(seasonal,{season:'',activity:''},now).length,seasonal.length);
assert.deepEqual(recruitingSeasons([]), recruitingPeriods);
assert.deepEqual(filterOpportunities(seasonal,{season:'period:winter'},now).map(x=>x.id),['target','winter-duplicate']);
assert.deepEqual(filterOpportunities(seasonal,{season:'period:spring-summer'},now).map(x=>x.id),['applied']);
for (const value of ['Fall 2027','Autumn 2028','Fall2027']) assert.equal(recruitingPeriod(value),'period:fall');
for (const value of ['Spring 2027','Summer 2028','Spring/Summer 2027']) assert.equal(recruitingPeriod(value),'period:spring-summer');
assert.equal(recruitingPeriod('Fall/Winter 2027'),undefined,'Ambiguous seasons must remain explicit rather than guessed');
assert.equal(recruitingPeriod('January–April'),undefined,'Do not infer a saved season from dates');
const custom={...rows[0],recruitingSeason:'Off-cycle 2027'};
assert.deepEqual(recruitingSeasons([custom]),[...recruitingPeriods,{value:'season:off-cycle 2027',label:'Off-cycle 2027'}]);
assert.deepEqual(filterOpportunities([custom],{season:seasonKey('Off-cycle 2027')},now),[custom]);
console.log('✓ Opportunity filters, recruiting seasons, normalization, combinations, missing seasons, and deadline behavior verified.');
