import { describe, expect, it } from 'vitest';

import { resolveBirdMigrationSelectedSeasonStart } from '../utils/birdMigrationDisplay';
import { mergeBirdMigrationRowsWithThumbnails } from '../utils/birdMigrationAnalytics';

describe('useBirdMigrationPage helpers', () => {
  it('falls back to the current season when the requested season is missing', () => {
    const displaySeasons = [{ start_date: '2025-12-21' }, { start_date: '2026-03-20' }];

    expect(
      resolveBirdMigrationSelectedSeasonStart(displaySeasons, '2026-03-20', '2024-03-20')
    ).toBe('2026-03-20');
    expect(resolveBirdMigrationSelectedSeasonStart(displaySeasons, '2026-03-20', null)).toBe(
      '2026-03-20'
    );
    expect(resolveBirdMigrationSelectedSeasonStart(displaySeasons, '', '2025-12-21')).toBe(
      '2025-12-21'
    );
  });

  it('merges thumbnail URLs without altering unmatched rows', () => {
    const rows = [
      { scientific_name: 'Cygnus cygnus', common_name: 'Whooper Swan' },
      { scientific_name: 'Grus grus', common_name: 'Common Crane' },
    ];

    expect(
      mergeBirdMigrationRowsWithThumbnails(rows, {
        'Cygnus cygnus': '/thumbs/whooper-swan.jpg',
      })
    ).toEqual([
      {
        scientific_name: 'Cygnus cygnus',
        common_name: 'Whooper Swan',
        thumbnail_url: '/thumbs/whooper-swan.jpg',
      },
      {
        scientific_name: 'Grus grus',
        common_name: 'Common Crane',
      },
    ]);
  });
});
