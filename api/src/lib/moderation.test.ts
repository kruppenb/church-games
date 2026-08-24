import { describe, expect, it } from 'vitest';
import { checkModerationKey } from './moderation';

describe('checkModerationKey', () => {
  it('accepts an exact match', () => {
    expect(checkModerationKey('s3cret', 's3cret')).toBe(true);
  });

  it('rejects when the app setting is unset or blank', () => {
    expect(checkModerationKey('s3cret', undefined)).toBe(false);
    expect(checkModerationKey('s3cret', null)).toBe(false);
    expect(checkModerationKey('s3cret', '')).toBe(false);
    // No setting means no moderation, even with a matching empty header.
    expect(checkModerationKey('', '')).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(checkModerationKey(undefined, 's3cret')).toBe(false);
    expect(checkModerationKey(null, 's3cret')).toBe(false);
    expect(checkModerationKey('', 's3cret')).toBe(false);
  });

  it('rejects mismatches of any length (no length leak, no crash)', () => {
    expect(checkModerationKey('s3cre', 's3cret')).toBe(false);
    expect(checkModerationKey('s3crett', 's3cret')).toBe(false);
    expect(checkModerationKey('S3CRET', 's3cret')).toBe(false);
    expect(checkModerationKey('x'.repeat(4096), 's3cret')).toBe(false);
  });
});
