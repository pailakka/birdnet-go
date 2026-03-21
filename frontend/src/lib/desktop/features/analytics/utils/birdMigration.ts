import type { PublicSeason, PublicSeasonalTracking } from '$lib/stores/appState.svelte';
import { addDays, getLocalDateString, parseLocalDateString } from '$lib/utils/date';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface BirdMigrationResolvedSeason {
  name: string;
  anchorDate: string;
  startDate: string;
  endDate: string;
  queryEndDate: string;
  previousAnchorDate: string;
  nextAnchorDate: string;
}

export interface BirdMigrationSpeciesSummary {
  common_name: string;
  scientific_name: string;
  species_code?: string;
  count: number;
  active_days: number;
  first_heard: string;
  last_heard: string;
  avg_confidence: number;
  max_confidence: number;
  thumbnail_url?: string;
}

export interface BirdMigrationSpeciesRecord extends BirdMigrationSpeciesSummary {
  first_heard_date: string;
  last_heard_date: string;
  days_since_first_seen: number;
  days_since_last_seen: number;
}

export interface BirdMigrationDailyDetections {
  date: string;
  count: number;
}

export interface BirdMigrationDailyDiversity {
  date: string;
  unique_species: number;
}

export interface BirdMigrationArrivalDatum {
  date: string;
  newSpeciesCount: number;
  cumulativeSpeciesCount: number;
}

export interface BirdMigrationActivityDatum {
  date: string;
  detectionCount: number;
  activeSpeciesCount: number;
}

export interface BirdMigrationSummaryStats {
  speciesCount: number;
  detectionCount: number;
  recentArrivalsCount: number;
  quietSpeciesCount: number;
}

export interface BirdMigrationDerivedData {
  summary: BirdMigrationSummaryStats;
  roster: BirdMigrationSpeciesRecord[];
  recentArrivals: BirdMigrationSpeciesRecord[];
  quietSpecies: BirdMigrationSpeciesRecord[];
  arrivalTimeline: BirdMigrationArrivalDatum[];
  activityTimeline: BirdMigrationActivityDatum[];
}

function createSeasonDate(year: number, season: PublicSeason): Date {
  return new Date(year, season.startMonth - 1, season.startDay, 12, 0, 0, 0);
}

function extractLocalDate(datetime: string): string {
  const dateMatch = datetime.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    return dateMatch[1];
  }

  const parsed = parseLocalDateString(datetime);
  return parsed ? getLocalDateString(parsed) : '';
}

function getSortedSeasonEntries(
  seasons: Record<string, PublicSeason>
): Array<[string, PublicSeason]> {
  return Object.entries(seasons).sort(([nameA, seasonA], [nameB, seasonB]) => {
    if (seasonA.startMonth !== seasonB.startMonth) {
      return seasonA.startMonth - seasonB.startMonth;
    }
    if (seasonA.startDay !== seasonB.startDay) {
      return seasonA.startDay - seasonB.startDay;
    }
    return nameA.localeCompare(nameB);
  });
}

function getPreviousOrCurrentSeasonStart(anchor: Date, name: string, season: PublicSeason) {
  const start = createSeasonDate(anchor.getFullYear(), season);
  if (start.getTime() > anchor.getTime()) {
    start.setFullYear(start.getFullYear() - 1);
  }

  return { name, season, start };
}

function getNextSeasonStart(after: Date, entries: Array<[string, PublicSeason]>) {
  const candidates = entries.map(([name, season]) => {
    const start = createSeasonDate(after.getFullYear(), season);
    if (start.getTime() <= after.getTime()) {
      start.setFullYear(start.getFullYear() + 1);
    }

    return { name, season, start };
  });

  return candidates.reduce((closest, candidate) =>
    candidate.start.getTime() < closest.start.getTime() ? candidate : closest
  );
}

function getPreviousSeasonStart(before: Date, entries: Array<[string, PublicSeason]>) {
  const candidates = entries.map(([name, season]) => {
    const start = createSeasonDate(before.getFullYear(), season);
    if (start.getTime() >= before.getTime()) {
      start.setFullYear(start.getFullYear() - 1);
    }

    return { name, season, start };
  });

  return candidates.reduce((closest, candidate) =>
    candidate.start.getTime() > closest.start.getTime() ? candidate : closest
  );
}

export function getBirdMigrationDayDifference(fromDate: string, toDate: string): number {
  const from = parseLocalDateString(fromDate);
  const to = parseLocalDateString(toDate);
  if (!from || !to) {
    return 0;
  }

  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

export function getBirdMigrationDateRange(startDate: string, endDate: string): string[] {
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

export function resolveBirdMigrationSeason(
  seasonalTracking: PublicSeasonalTracking,
  anchorDate: string
): BirdMigrationResolvedSeason | null {
  if (!seasonalTracking.enabled) {
    return null;
  }

  const entries = getSortedSeasonEntries(seasonalTracking.seasons);
  if (entries.length === 0) {
    return null;
  }

  const anchor = parseLocalDateString(anchorDate);
  if (!anchor) {
    return null;
  }

  const resolved = entries
    .map(([name, season]) => getPreviousOrCurrentSeasonStart(anchor, name, season))
    .reduce((current, candidate) =>
      candidate.start.getTime() > current.start.getTime() ? candidate : current
    );

  const previousSeason = getPreviousSeasonStart(resolved.start, entries);
  const nextSeason = getNextSeasonStart(resolved.start, entries);
  const startDate = getLocalDateString(resolved.start);
  const endDate = addDays(getLocalDateString(nextSeason.start), -1);
  const queryEndDate = anchorDate < endDate ? anchorDate : endDate;
  const previousAnchorDate = getLocalDateString(previousSeason.start);
  const nextAnchorDate = getLocalDateString(nextSeason.start);

  return {
    name: resolved.name,
    anchorDate,
    startDate,
    endDate,
    queryEndDate,
    previousAnchorDate,
    nextAnchorDate,
  };
}

export function deriveBirdMigrationRoster(
  species: BirdMigrationSpeciesSummary[],
  anchorDate: string
): BirdMigrationSpeciesRecord[] {
  return [...species]
    .map(item => {
      const firstHeardDate = extractLocalDate(item.first_heard);
      const lastHeardDate = extractLocalDate(item.last_heard);

      return {
        ...item,
        first_heard_date: firstHeardDate,
        last_heard_date: lastHeardDate,
        days_since_first_seen: getBirdMigrationDayDifference(firstHeardDate, anchorDate),
        days_since_last_seen: getBirdMigrationDayDifference(lastHeardDate, anchorDate),
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
): BirdMigrationArrivalDatum[] {
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

export function deriveBirdMigrationAnalytics(
  species: BirdMigrationSpeciesSummary[],
  dailyDetections: BirdMigrationDailyDetections[],
  dailyDiversity: BirdMigrationDailyDiversity[],
  resolvedSeason: BirdMigrationResolvedSeason,
  windowDays: number
): BirdMigrationDerivedData {
  const roster = deriveBirdMigrationRoster(species, resolvedSeason.queryEndDate);
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
    resolvedSeason.startDate,
    resolvedSeason.queryEndDate
  );
  const activityTimeline = buildBirdMigrationActivityTimeline(
    dailyDetections,
    dailyDiversity,
    resolvedSeason.startDate,
    resolvedSeason.queryEndDate
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
    arrivalTimeline,
    activityTimeline,
  };
}
