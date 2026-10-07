import assert from 'node:assert/strict';
import {zonedInput,zonedInstant} from './timezone.js';
import {parseRoute,recordPath} from './navigation.js';
 const instant='2026-10-10T17:00:00.000Z';
 assert.equal(zonedInstant(zonedInput(instant,'America/New_York'),'America/New_York',instant),instant);
 assert.equal(zonedInstant('2026-10-10T13:00','America/New_York'),'2026-10-10T17:00:00.000Z');
 assert.throws(()=>zonedInstant('2026-03-08T02:30','America/New_York'),/does not exist/);
 for(const original of ['2026-11-01T05:30:00.000Z','2026-11-01T06:30:00.000Z'])assert.equal(zonedInstant('2026-11-01T01:30','America/New_York',original),original);
 for(const kind of ['company','contact','opportunity','application','interview','task','document'] as const){const route=parseRoute(recordPath(kind,'record /?#'));assert.equal(route.kind,kind);assert.equal(route.id,'record /?#')}
console.log('✓ Record URL and timezone/DST regression checks.');
