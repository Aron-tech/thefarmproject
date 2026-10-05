import { describe, expect, it } from 'vitest';
import { formatCount } from './formatCount.ts';

describe('formatCount', () => {
  it('formats like the game resource bar', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(920)).toBe('920');
    expect(formatCount(2220)).toBe('2.22k');
    expect(formatCount(9000)).toBe('9k');
    expect(formatCount(10_850)).toBe('10.8k');
    expect(formatCount(474_000_000)).toBe('474M');
    expect(formatCount(1_550_000_000)).toBe('1.55B');
    expect(formatCount(999_999)).toBe('999k');
  });
});
