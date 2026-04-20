import { describe, expect, it, vi } from 'vitest';

import {
  buildBirdMigrationDetectionsUrl,
  buildBirdMigrationDisplaySeasons,
  findBirdMigrationSeason,
  formatBirdMigrationSeasonLabel,
  getBirdMigrationAdjacentSeasonStart,
} from './birdMigrationDisplay';
import type { BirdMigrationSeason } from './birdMigrationTypes';

vi.mock('$lib/i18n', () => ({
  t: vi.fn((key: string) => {
    const translations = new Map<string, string>([
      ['settings.species.tracking.seasonal.seasons.spring', 'Spring'],
      ['settings.species.tracking.seasonal.seasons.summer', 'Summer'],
      ['settings.species.tracking.seasonal.seasons.fall', 'Fall'],
      ['settings.species.tracking.seasonal.seasons.winter', 'Winter'],
    ]);

    return translations.get(key) ?? key;
  }),
}));

const seasons: BirdMigrationSeason[] = [
  {
    name: 'winter',
    start_date: '2025-12-21',
    end_date: '2026-02-28',
    is_current: false,
  },
  {
    name: 'spring',
    start_date: '2026-03-01',
    end_date: '2026-05-31',
    is_current: true,
  },
];

describe('bird migration display helpers', () => {
  it('finds a season by start date', () => {
    expect(findBirdMigrationSeason(seasons, '2026-03-01')).toEqual(seasons[1]);
    expect(findBirdMigrationSeason(seasons, '2026-06-21')).toBeNull();
  });

  it('builds localized season labels and adjacent season links', () => {
    const displaySeasons = buildBirdMigrationDisplaySeasons(seasons);

    expect(formatBirdMigrationSeasonLabel(seasons[0])).toBe('Winter 2025-2026');
    expect(formatBirdMigrationSeasonLabel(seasons[1])).toBe('Spring 2026');
    expect(displaySeasons[1]?.label).toBe('Spring 2026');
    expect(getBirdMigrationAdjacentSeasonStart(displaySeasons, '2026-03-01', 'previous')).toBe(
      '2025-12-21'
    );
    expect(getBirdMigrationAdjacentSeasonStart(displaySeasons, '2025-12-21', 'next')).toBe(
      '2026-03-01'
    );
  });

  it('builds range-based detections links', () => {
    expect(
      buildBirdMigrationDetectionsUrl('Cygnus cygnus', seasons[1], '2026-03-21', 'date_asc')
    ).toBe(
      '/ui/detections?queryType=species&species=Cygnus+cygnus&start_date=2026-03-01&end_date=2026-03-21&sortBy=date_asc&numResults=100&offset=0'
    );
  });
});
