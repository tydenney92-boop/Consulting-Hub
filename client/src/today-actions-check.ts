import {strict as assert} from 'node:assert';
import {actionPage} from './today-actions';

assert.equal(actionPage('task'), 'Tasks');
assert.equal(actionPage('contact'), 'Networking');
assert.equal(actionPage('opportunity'), 'Opportunities');
assert.equal(actionPage('application'), 'Applications');
assert.equal(actionPage('interview'), 'Interviews');
console.log('✓ Today queue record navigation maps every action type to its record workspace.');
