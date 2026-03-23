import { t } from '$lib/i18n';
import { addDays, getLocalDateString, parseLocalDateString } from '$lib/utils/date';
import { safeArrayAccess } from '$lib/utils/security';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface BirdMigrationSeason {
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

export interface BirdMigrationDisplaySeason extends BirdMigrationSeason {
  label: string;
}

export type BirdMigrationDetectionsSortBy = 'date_asc' | 'date_desc';

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

export interface BirdMigrationDisappearanceRecord {
  common_name: string;
  scientific_name: string;
  species_code?: string;
  last_heard_before_gap: string;
  returned_on: string;
  gap_days: number;
  thumbnail_url?: string;
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
  disappearances: BirdMigrationDisappearanceRecord[];
  arrivalTimeline: BirdMigrationArrivalDatum[];
  activityTimeline: BirdMigrationActivityDatum[];
}

function extractLocalDate(datetime: string): string {
  const dateMatch = datetime.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    return dateMatch[1];
  }

  const parsed = parseLocalDateString(datetime);
  return parsed ? getLocalDateString(parsed) : '';
}

function titleCaseBirdMigrationSeasonName(name: string): string {
  return name
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function getBirdMigrationSeasonNameLabel(name: string): string {
  switch (name) {
    case 'spring':
    case 'summer':
    case 'fall':
    case 'winter':
    case 'wet1':
    case 'dry1':
    case 'wet2':
    case 'dry2':
      return t(`settings.species.tracking.seasonal.seasons.${name}`);
    default:
      return titleCaseBirdMigrationSeasonName(name);
  }
}

function getBirdMigrationSeasonYearLabel(season: BirdMigrationSeason): string {
  const startYear = parseLocalDateString(season.start_date)?.getFullYear();
  const endYear = parseLocalDateString(season.end_date)?.getFullYear();

  if (!startYear || !endYear || startYear === endYear) {
    return String(startYear ?? endYear ?? '');
  }

  return `${startYear}-${endYear}`;
}

function parseBirdMigrationApiDateTime(dateString: string): Date | null {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dateString)) {
    return parseLocalDateString(dateString.replace(' ', 'T'));
  }

  return parseLocalDateString(dateString);
}

export function formatBirdMigrationSeasonLabel(season: BirdMigrationSeason): string {
  return `${getBirdMigrationSeasonNameLabel(season.name)} ${getBirdMigrationSeasonYearLabel(season)}`;
}

export function buildBirdMigrationDisplaySeasons(
  seasons: BirdMigrationSeason[]
): BirdMigrationDisplaySeason[] {
  return seasons.map(season => ({
    ...season,
    label: formatBirdMigrationSeasonLabel(season),
  }));
}

export function findBirdMigrationSeason<T extends { start_date: string }>(
  seasons: T[],
  seasonStart: string
): T | null {
  return seasons.find(season => season.start_date === seasonStart) ?? null;
}

export function getBirdMigrationAdjacentSeasonStart<T extends { start_date: string }>(
  seasons: T[],
  seasonStart: string,
  direction: 'previous' | 'next'
): string | null {
  const currentIndex = seasons.findIndex(season => season.start_date === seasonStart);
  if (currentIndex < 0) {
    return null;
  }

  const adjacentIndex = direction === 'previous' ? currentIndex - 1 : currentIndex + 1;
  return safeArrayAccess(seasons, adjacentIndex)?.start_date ?? null;
}

export function getBirdMigrationObservedEndDate(
  season: BirdMigrationSeason,
  today: string = getLocalDateString()
): string {
  if (season.is_current && today < season.end_date) {
    return today;
  }

  return season.end_date;
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

export function formatBirdMigrationDate(dateString: string): string {
  const parsed = parseLocalDateString(dateString);
  if (!parsed) {
    return dateString;
  }

  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatBirdMigrationDateTime(dateString: string): string {
  const parsed = parseBirdMigrationApiDateTime(dateString);
  if (!parsed) {
    return dateString;
  }

  return parsed.toLocaleString();
}

export function formatBirdMigrationNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

export function getBirdMigrationSpeciesInitials(commonName: string): string {
  return commonName.slice(0, 2).toUpperCase();
}

export function buildBirdMigrationDetectionsUrl(
  speciesName: string,
  season: Pick<BirdMigrationSeason, 'start_date'>,
  observedEndDate: string,
  sortBy: BirdMigrationDetectionsSortBy,
  resultsLimit: string = '100'
): string {
  const params = new URLSearchParams({
    queryType: 'species',
    species: speciesName,
    start_date: season.start_date,
    end_date: observedEndDate,
    sortBy,
    numResults: resultsLimit,
    offset: '0',
  });

  return `/ui/detections?${params.toString()}`;
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
