import {strict as assert} from 'node:assert';
import {applicationExternalLink, filterApplications} from './application-workspace';

const rows = [
  {id:'active',currentStage:'APPLIED',applicationPortalUrl:'https://apply.example.com/1',opportunity:{company:{name:'Example Strategy'},roleTitle:'Growth Strategy Intern',practiceArea:'Strategy',location:'Denver',recruitingSeason:'Summer 2027',jobUrl:'https://jobs.example.com/1'}},
  {id:'offer',currentStage:'OFFER',opportunity:{company:{name:'Example Advisory'},roleTitle:'Economic Analyst'}},
  {id:'closed',currentStage:'CLOSED',opportunity:{company:{name:'Example Sports'},roleTitle:'Business Strategy Intern'}},
];

assert.deepEqual(filterApplications(rows).map(x=>x.id),['active']);
assert.deepEqual(filterApplications(rows,'sports','all').map(x=>x.id),['closed']);
assert.deepEqual(filterApplications(rows,'economic','terminal').map(x=>x.id),['offer']);
assert.equal(applicationExternalLink(rows[0])?.href,'https://apply.example.com/1');
assert.equal(applicationExternalLink({...rows[0],applicationPortalUrl:null})?.href,'https://jobs.example.com/1');
assert.equal(applicationExternalLink({opportunity:{company:{careersUrl:'https://example.com/careers'}}})?.label,'Open company careers');
assert.equal(applicationExternalLink({applicationPortalUrl:'javascript:alert(1)',opportunity:{}}),null);
console.log('✓ Application search, lifecycle filters, and external-link priority verified.');
