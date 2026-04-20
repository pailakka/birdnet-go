import { describe, expect, it } from 'vitest';

import { parseDetectionDateFilter } from './queryParams';

describe('parseDetectionDateFilter', () => {
  it('does not inject a single date when a range is present', () => {
    const params = new URLSearchParams(
      'queryType=species&species=Cygnus+cygnus&start_date=2026-03-01&end_date=2026-03-21'
    );

    expect(parseDetectionDateFilter(params)).toEqual({
      date: undefined,
      start_date: '2026-03-01',
      end_date: '2026-03-21',
    });
  });

  it('falls back to today only when no date filter is provided', () => {
    const params = new URLSearchParams('queryType=all');
    const result = parseDetectionDateFilter(params);

    expect(result.start_date).toBeUndefined();
    expect(result.end_date).toBeUndefined();
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
