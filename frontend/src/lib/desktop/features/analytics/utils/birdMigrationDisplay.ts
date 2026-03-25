import { t } from '$lib/i18n';
import { getLocalDateString, parseLocalDateString } from '$lib/utils/date';

import type {
  BirdMigrationDetectionsSortBy,
  BirdMigrationDisplaySeason,
  BirdMigrationSeason,
} from './birdMigrationTypes';

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

export function resolveBirdMigrationSelectedSeasonStart(
  seasons: Array<Pick<BirdMigrationDisplaySeason, 'start_date'>>,
  currentSeasonStart: string,
  requestedSeasonStart: string | null
): string {
  if (requestedSeasonStart && seasons.some(season => season.start_date === requestedSeasonStart)) {
    return requestedSeasonStart;
  }

  return currentSeasonStart || seasons[0]?.start_date || '';
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
  if (adjacentIndex < 0 || adjacentIndex >= seasons.length) {
    return null;
  }

  const adjacentSeason = seasons.at(adjacentIndex);
  return adjacentSeason?.start_date ?? null;
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
