import {strict as assert} from 'node:assert';
import {parsePosting,sourceFromUrl,normalizedName} from './quick-add.js';
const posting='Bain & Company\nSummer Associate Intern\nLocation: Dallas, TX\nApplication deadline: October 15, 2026\nManagement Consulting';
const parsed=parsePosting(posting,'https://www.linkedin.com/jobs/view/1');
assert.equal(parsed.roleTitle,'Summer Associate Intern');assert.equal(parsed.location,'Dallas, TX');assert.equal(parsed.applicationDeadline,'2026-10-15');assert.equal(parsed.source,'LinkedIn');
assert.equal(sourceFromUrl('https://app.joinhandshake.com/jobs/1'),'Handshake');assert.equal(normalizedName(' Bain  & Company '),'bain & company');
const minimal=parsePosting('Help analyze market questions.');assert.equal(minimal.company,'');assert.equal(minimal.applicationDeadline,'');
console.log('✓ Quick Add deterministic parsing, source recognition, and blank ambiguous fields verified.');
