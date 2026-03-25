import { describe, expect, it, vi } from 'vitest';

import {
  buildBirdMigrationDetectionsUrl,
  buildBirdMigrationDisplaySeasons,
  deriveBirdMigrationAnalytics,
  findBirdMigrationSeason,
  formatBirdMigrationSeasonLabel,
  getBirdMigrationAdjacentSeasonStart,
  getBirdMigrationObservedEndDate,
  sortBirdMigrationDisappearances,
  type BirdMigrationDailyDetections,
  type BirdMigrationDailyDiversity,
  type BirdMigrationDisappearanceRecord,
  type BirdMigrationSeason,
  type BirdMigrationSpeciesSummary,
} from './birdMigration';

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
    end_date: '2026-06-20',
    is_current: true,
  },
];

describe('bird migration season helpers', () => {
  it('finds a season by start date', () => {
    expect(findBirdMigrationSeason(seasons, '2026-03-01')).toEqual(seasons[1]);
    expect(findBirdMigrationSeason(seasons, '2026-06-21')).toBeNull();
  });

  it('clamps the observed end date for the current season', () => {
    expect(getBirdMigrationObservedEndDate(seasons[1], '2026-03-21')).toBe('2026-03-21');
    expect(getBirdMigrationObservedEndDate(seasons[0], '2026-03-21')).toBe('2026-02-28');
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

describe('deriveBirdMigrationAnalytics', () => {
  const species: BirdMigrationSpeciesSummary[] = [
    {
      common_name: 'Whooper Swan',
      scientific_name: 'Cygnus cygnus',
      species_code: 'whoswa',
      count: 8,
      active_days: 3,
      first_heard: '2026-03-18 07:10:00',
      last_heard: '2026-03-21 08:20:00',
      avg_confidence: 0.92,
      max_confidence: 0.97,
    },
    {
      common_name: 'Common Crane',
      scientific_name: 'Grus grus',
      species_code: 'comcra',
      count: 5,
      active_days: 2,
      first_heard: '2026-03-10 06:15:00',
      last_heard: '2026-03-12 06:40:00',
      avg_confidence: 0.87,
      max_confidence: 0.93,
    },
    {
      common_name: 'European Robin',
      scientific_name: 'Erithacus rubecula',
      species_code: 'eurrob',
      count: 11,
      active_days: 5,
      first_heard: '2026-03-01 05:45:00',
      last_heard: '2026-03-20 06:00:00',
      avg_confidence: 0.89,
      max_confidence: 0.95,
    },
  ];

  const dailyDetections: BirdMigrationDailyDetections[] = [
    { date: '2026-03-18', count: 4 },
    { date: '2026-03-19', count: 7 },
    { date: '2026-03-20', count: 5 },
    { date: '2026-03-21', count: 8 },
  ];

  const dailyDiversity: BirdMigrationDailyDiversity[] = [
    { date: '2026-03-18', unique_species: 1 },
    { date: '2026-03-19', unique_species: 1 },
    { date: '2026-03-20', unique_species: 2 },
    { date: '2026-03-21', unique_species: 3 },
  ];

  const disappearances: BirdMigrationDisappearanceRecord[] = [
    {
      common_name: 'Common Blackbird',
      scientific_name: 'Turdus merula',
      species_code: 'combla',
      last_heard_before_gap: '2025-10-29',
      returned_on: '2026-03-17',
      gap_days: 139,
    },
    {
      common_name: 'Fieldfare',
      scientific_name: 'Turdus pilaris',
      species_code: 'fieldf',
      last_heard_before_gap: '2026-03-01',
      returned_on: '2026-03-12',
      gap_days: 11,
    },
  ];

  it('derives recent arrivals, quiet species, roster sorting, and timelines', () => {
    const analytics = deriveBirdMigrationAnalytics(
      species,
      dailyDetections,
      dailyDiversity,
      disappearances,
      seasons[1],
      '2026-03-21',
      7
    );

    expect(analytics.summary.speciesCount).toBe(3);
    expect(analytics.summary.detectionCount).toBe(24);
    expect(analytics.summary.recentArrivalsCount).toBe(1);
    expect(analytics.summary.quietSpeciesCount).toBe(1);

    expect(analytics.recentArrivals.map(item => item.scientific_name)).toEqual(['Cygnus cygnus']);
    expect(analytics.quietSpecies.map(item => item.scientific_name)).toEqual(['Grus grus']);
    expect(analytics.disappearances.map(item => item.scientific_name)).toEqual([
      'Turdus merula',
      'Turdus pilaris',
    ]);
    expect(analytics.roster.map(item => item.scientific_name)).toEqual([
      'Erithacus rubecula',
      'Cygnus cygnus',
      'Grus grus',
    ]);

    expect(analytics.arrivalTimeline.at(-1)).toEqual({
      date: '2026-03-21',
      newSpeciesCount: 0,
      cumulativeSpeciesCount: 3,
    });

    expect(analytics.activityTimeline.at(-1)).toEqual({
      date: '2026-03-21',
      detectionCount: 8,
      activeSpeciesCount: 3,
    });
  });
});

describe('sortBirdMigrationDisappearances', () => {
  it('sorts by longest gap first, then by returned date, then by name', () => {
    const sorted = sortBirdMigrationDisappearances([
      {
        common_name: 'Fieldfare',
        scientific_name: 'Turdus pilaris',
        last_heard_before_gap: '2026-03-01',
        returned_on: '2026-03-12',
        gap_days: 11,
      },
      {
        common_name: 'Common Blackbird',
        scientific_name: 'Turdus merula',
        last_heard_before_gap: '2025-10-29',
        returned_on: '2026-03-17',
        gap_days: 139,
      },
      {
        common_name: 'Redwing',
        scientific_name: 'Turdus iliacus',
        last_heard_before_gap: '2026-03-01',
        returned_on: '2026-03-15',
        gap_days: 11,
      },
    ]);

    expect(sorted.map(item => item.scientific_name)).toEqual([
      'Turdus merula',
      'Turdus iliacus',
      'Turdus pilaris',
    ]);
  });
});
