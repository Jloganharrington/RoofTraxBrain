import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sanitize } from './doc.js';

// sanitize() is the single chokepoint every exhibit's text passes through
// before drawText. A real submission carries null fields the fixtures never
// did; one null cell used to crash the whole package build (doc.ts:19,
// "Cannot read properties of null (reading 'replace')"). These lock the guard.
describe('sanitize is null-safe', () => {
  test('nullish becomes empty string, never throws', () => {
    assert.equal(sanitize(null), '');
    assert.equal(sanitize(undefined), '');
    assert.equal(sanitize(''), '');
  });

  test('real strings still get their unicode normalised', () => {
    assert.equal(sanitize('“quote”'), '"quote"');
    assert.equal(sanitize('it’s'), "it's");
    assert.equal(sanitize('a – b'), 'a - b');
    assert.equal(sanitize('x…'), 'x...');
  });

  test('coerces non-strings rather than assuming a string came in', () => {
    // Exhibits occasionally pass a number/boolean cell; must not throw.
    assert.equal(sanitize(42 as never), '42');
    assert.equal(sanitize(true as never), 'true');
  });
});
