import { describe, expect, it } from 'vitest';
import { suggestToolName } from '../src/models/hallucination';

describe('suggestToolName', () => {
  it('suggests the nearest available tool name', () => {
    expect(suggestToolName('ech', ['echo', 'search'])).toBe(
      "Use 'echo' instead of 'ech'.",
    );
  });

  it('falls back to listing available tools when there is no close match', () => {
    expect(suggestToolName('delete_all', ['echo', 'search'])).toBe(
      'Available tools: echo, search',
    );
  });
});
