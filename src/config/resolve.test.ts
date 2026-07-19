import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The counsel-review gate is the difference between "we may look at this data"
// and "we may render a legal document from it". These tests guard the boundary
// structurally: a future edit that adds the allowance to the package path — or
// removes the not-go-live marker from the data path — fails here.

const resolveSrc = readFileSync('src/config/resolve.ts', 'utf8');
const packagesSrc = readFileSync('src/routes/packages.ts', 'utf8');

describe('counsel-review gate', () => {
  test('resolveConfig still throws for an unreviewed state by DEFAULT', () => {
    // The guard must be opt-out, never opt-in: omitting the option keeps the block.
    assert.match(resolveSrc, /if \(!state\.reviewedAt && !opts\.allowUnreviewedState\)/);
    assert.match(resolveSrc, /refusing to render a package for a non-go-live state/);
  });

  test('exactly one call site opts out, and it is NOT the package renderer', () => {
    const calls = [...packagesSrc.matchAll(/resolveConfig\([^)]*\)/gs)].map((m) => m[0]);
    assert.equal(calls.length, 2, 'expected exactly two resolveConfig call sites');

    const optedOut = calls.filter((c) => c.includes('allowUnreviewedState'));
    assert.equal(optedOut.length, 1, 'exactly one call site may bypass the gate');

    // The package route is defined before report-data, so its call comes first.
    const packageCallIdx = packagesSrc.indexOf("packagesRouter.post('/submissions/:id/package'");
    const reportCallIdx = packagesSrc.indexOf("packagesRouter.get('/submissions/:id/report-data'");
    const bypassIdx = packagesSrc.indexOf('allowUnreviewedState');
    assert.ok(packageCallIdx >= 0 && reportCallIdx >= 0 && bypassIdx >= 0);
    assert.ok(
      bypassIdx > reportCallIdx,
      'the bypass must live inside the report-data handler, not the package handler',
    );
    assert.ok(
      bypassIdx > packageCallIdx,
      'the package handler must not contain the bypass',
    );
  });

  test('an unreviewed payload is stamped so it cannot pass as go-live', () => {
    assert.match(packagesSrc, /goLive: stateGoLive/);
    assert.match(packagesSrc, /notGoLiveWarning/);
    assert.match(packagesSrc, /MUST NOT be rendered or delivered as a proof package/);
  });
});
