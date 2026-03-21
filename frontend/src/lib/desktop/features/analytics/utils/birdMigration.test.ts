import { describe, expect, it } from 'vitest';

import {
  deriveBirdMigrationAnalytics,
  resolveBirdMigrationSeason,
  type BirdMigrationDailyDetections,
  type BirdMigrationDailyDiversity,
  type BirdMigrationSpeciesSummary,
} from './birdMigration';

const seasonalTracking = {
  enabled: true,
  windowDays: 7,
  seasons: {
    spring: { startMonth: 3, startDay: 20 },
    summer: { startMonth: 6, startDay: 21 },
    fall: { startMonth: 9, startDay: 22 },
    winter: { startMonth: 12, startDay: 21 },
  },
};

const analyticsSeasonalTracking = {
  enabled: true,
  windowDays: 7,
  seasons: {
    spring: { startMonth: 3, startDay: 1 },
    summer: { startMonth: 6, startDay: 1 },
    fall: { startMonth: 9, startDay: 1 },
    winter: { startMonth: 12, startDay: 1 },
  },
};

describe('resolveBirdMigrationSeason', () => {
  it('resolves winter across a year boundary', () => {
    const season = resolveBirdMigrationSeason(seasonalTracking, '2026-01-15');

    expect(season).not.toBeNull();
    expect(season?.name).toBe('winter');
    expect(season?.startDate).toBe('2025-12-21');
    expect(season?.endDate).toBe('2026-03-19');
    expect(season?.previousAnchorDate).toBe('2025-09-22');
    expect(season?.nextAnchorDate).toBe('2026-03-20');
    expect(season?.queryEndDate).toBe('2026-01-15');
  });

  it('returns null when seasonal tracking is disabled', () => {
    const season = resolveBirdMigrationSeason(
      {
        ...seasonalTracking,
        enabled: false,
      },
      '2026-03-21'
    );

    expect(season).toBeNull();
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

  it('derives recent arrivals, quiet species, roster sorting, and timelines', () => {
    const resolvedSeason = resolveBirdMigrationSeason(analyticsSeasonalTracking, '2026-03-21');
    expect(resolvedSeason).not.toBeNull();

    const analytics = deriveBirdMigrationAnalytics(
      species,
      dailyDetections,
      dailyDiversity,
      resolvedSeason!,
      analyticsSeasonalTracking.windowDays
    );

    expect(analytics.summary.speciesCount).toBe(3);
    expect(analytics.summary.detectionCount).toBe(24);
    expect(analytics.summary.recentArrivalsCount).toBe(1);
    expect(analytics.summary.quietSpeciesCount).toBe(1);

    expect(analytics.recentArrivals.map(item => item.scientific_name)).toEqual(['Cygnus cygnus']);
    expect(analytics.quietSpecies.map(item => item.scientific_name)).toEqual(['Grus grus']);
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
