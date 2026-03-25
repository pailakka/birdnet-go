import { addDays, getLocalDateString, parseLocalDateString } from '$lib/utils/date';

import type {
  BirdMigrationActivityDatum,
  BirdMigrationDailyDetections,
  BirdMigrationDailyDiversity,
  BirdMigrationDerivedData,
  BirdMigrationDisappearanceRecord,
  BirdMigrationSeason,
  BirdMigrationSpeciesRecord,
  BirdMigrationSpeciesSummary,
} from './birdMigrationTypes';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface BirdMigrationThumbnailRow {
  scientific_name: string;
  thumbnail_url?: string;
}

function extractLocalDate(datetime: string): string {
  const dateMatch = datetime.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    return dateMatch[1];
  }

  const parsed = parseLocalDateString(datetime);
  return parsed ? getLocalDateString(parsed) : '';
}

function getBirdMigrationDayDifference(fromDate: string, toDate: string): number {
  const from = parseLocalDateString(fromDate);
  const to = parseLocalDateString(toDate);
  if (!from || !to) {
    return 0;
  }

  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

function getBirdMigrationDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  let cursor = startDate;

  while (cursor <= endDate) {
    dates.push(cursor);
    if (cursor === endDate) {
      break;
    }
    cursor = addDays(cursor, 1);
  }

  return dates;
}

export function mergeBirdMigrationRowsWithThumbnails<T extends BirdMigrationThumbnailRow>(
  rows: T[],
  thumbnails: Record<string, string>
): T[] {
  return rows.map(row => {
    const thumbnailUrl = thumbnails[row.scientific_name];
    return thumbnailUrl ? { ...row, thumbnail_url: thumbnailUrl } : row;
  });
}

export function deriveBirdMigrationRoster(
  species: BirdMigrationSpeciesSummary[],
  observedEndDate: string
): BirdMigrationSpeciesRecord[] {
  return [...species]
    .map(item => {
      const firstHeardDate = extractLocalDate(item.first_heard);
      const lastHeardDate = extractLocalDate(item.last_heard);

      return {
        ...item,
        first_heard_date: firstHeardDate,
        last_heard_date: lastHeardDate,
        days_since_first_seen: getBirdMigrationDayDifference(firstHeardDate, observedEndDate),
        days_since_last_seen: getBirdMigrationDayDifference(lastHeardDate, observedEndDate),
      };
    })
    .sort((left, right) => {
      if (left.active_days !== right.active_days) {
        return right.active_days - left.active_days;
      }
      if (left.count !== right.count) {
        return right.count - left.count;
      }
      return left.common_name.localeCompare(right.common_name);
    });
}

export function buildBirdMigrationArrivalTimeline(
  roster: BirdMigrationSpeciesRecord[],
  startDate: string,
  endDate: string
) {
  const arrivalsByDate = new Map<string, number>();
  for (const species of roster) {
    arrivalsByDate.set(
      species.first_heard_date,
      (arrivalsByDate.get(species.first_heard_date) ?? 0) + 1
    );
  }

  let cumulativeSpeciesCount = 0;
  return getBirdMigrationDateRange(startDate, endDate).map(date => {
    const newSpeciesCount = arrivalsByDate.get(date) ?? 0;
    cumulativeSpeciesCount += newSpeciesCount;

    return {
      date,
      newSpeciesCount,
      cumulativeSpeciesCount,
    };
  });
}

export function buildBirdMigrationActivityTimeline(
  dailyDetections: BirdMigrationDailyDetections[],
  dailyDiversity: BirdMigrationDailyDiversity[],
  startDate: string,
  endDate: string
): BirdMigrationActivityDatum[] {
  const detectionMap = new Map(dailyDetections.map(item => [item.date, item.count]));
  const diversityMap = new Map(dailyDiversity.map(item => [item.date, item.unique_species]));

  return getBirdMigrationDateRange(startDate, endDate).map(date => ({
    date,
    detectionCount: detectionMap.get(date) ?? 0,
    activeSpeciesCount: diversityMap.get(date) ?? 0,
  }));
}

export function sortBirdMigrationDisappearances(
  disappearances: BirdMigrationDisappearanceRecord[]
): BirdMigrationDisappearanceRecord[] {
  return [...disappearances].sort((left, right) => {
    if (left.gap_days !== right.gap_days) {
      return right.gap_days - left.gap_days;
    }
    if (left.returned_on !== right.returned_on) {
      return right.returned_on.localeCompare(left.returned_on);
    }
    return left.common_name.localeCompare(right.common_name);
  });
}

export function deriveBirdMigrationAnalytics(
  species: BirdMigrationSpeciesSummary[],
  dailyDetections: BirdMigrationDailyDetections[],
  dailyDiversity: BirdMigrationDailyDiversity[],
  disappearances: BirdMigrationDisappearanceRecord[],
  season: BirdMigrationSeason,
  observedEndDate: string,
  windowDays: number
): BirdMigrationDerivedData {
  const roster = deriveBirdMigrationRoster(species, observedEndDate);
  const recentArrivals = roster
    .filter(item => item.days_since_first_seen <= windowDays)
    .sort((left, right) => {
      if (left.first_heard_date !== right.first_heard_date) {
        return right.first_heard_date.localeCompare(left.first_heard_date);
      }
      if (left.active_days !== right.active_days) {
        return right.active_days - left.active_days;
      }
      return left.common_name.localeCompare(right.common_name);
    });

  const quietSpecies = roster
    .filter(item => item.days_since_last_seen > windowDays)
    .sort((left, right) => {
      if (left.days_since_last_seen !== right.days_since_last_seen) {
        return right.days_since_last_seen - left.days_since_last_seen;
      }
      if (left.active_days !== right.active_days) {
        return right.active_days - left.active_days;
      }
      return left.common_name.localeCompare(right.common_name);
    });

  const arrivalTimeline = buildBirdMigrationArrivalTimeline(
    roster,
    season.start_date,
    observedEndDate
  );
  const activityTimeline = buildBirdMigrationActivityTimeline(
    dailyDetections,
    dailyDiversity,
    season.start_date,
    observedEndDate
  );
  const detectionCount = roster.reduce((sum, item) => sum + item.count, 0);

  return {
    summary: {
      speciesCount: roster.length,
      detectionCount,
      recentArrivalsCount: recentArrivals.length,
      quietSpeciesCount: quietSpecies.length,
    },
    roster,
    recentArrivals,
    quietSpecies,
    disappearances: sortBirdMigrationDisappearances(disappearances),
    arrivalTimeline,
    activityTimeline,
  };
}
