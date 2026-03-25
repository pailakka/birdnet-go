import { onMount } from 'svelte';

import { t } from '$lib/i18n';
import { navigation } from '$lib/stores/navigation.svelte';
import { parseLocalDateString } from '$lib/utils/date';
import { loggers } from '$lib/utils/logger';
import { buildAppUrl } from '$lib/utils/urlHelpers';

import {
  deriveBirdMigrationAnalytics,
  mergeBirdMigrationRowsWithThumbnails,
} from '../utils/birdMigrationAnalytics';
import {
  buildBirdMigrationDetectionsUrl,
  buildBirdMigrationDisplaySeasons,
  findBirdMigrationSeason,
  getBirdMigrationAdjacentSeasonStart,
  getBirdMigrationObservedEndDate,
  resolveBirdMigrationSelectedSeasonStart,
} from '../utils/birdMigrationDisplay';
import type {
  BirdMigrationDailyDetections,
  BirdMigrationDailyDiversity,
  BirdMigrationDerivedData,
  BirdMigrationDisappearanceRecord,
  BirdMigrationDisplaySeason,
  BirdMigrationDetectionsSortBy,
  BirdMigrationSeason,
  BirdMigrationSpeciesRecord,
  BirdMigrationSpeciesSummary,
} from '../utils/birdMigrationTypes';

interface BirdMigrationSeasonsResponse {
  enabled: boolean;
  window_days: number;
  current_season_start: string;
  seasons: BirdMigrationSeason[];
}

interface DailyAnalyticsResponse {
  data?: BirdMigrationDailyDetections[];
}

interface DiversityAnalyticsResponse {
  data?: BirdMigrationDailyDiversity[];
}

interface BirdMigrationDisappearancesResponse {
  data?: BirdMigrationDisappearanceRecord[];
}

const logger = loggers.analytics;
const THUMBNAIL_BATCH_SIZE = 20;
const THUMBNAIL_BATCH_DELAY_MS = 100;

function readBirdMigrationSeasonStartFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const seasonStart = params.get('season_start');
  if (!seasonStart) {
    return null;
  }

  return parseLocalDateString(seasonStart) ? seasonStart : null;
}

function writeBirdMigrationSeasonStartToUrl(seasonStart: string, replaceState = false): void {
  const url = new URL(window.location.href);
  url.searchParams.set('season_start', seasonStart);

  if (replaceState) {
    window.history.replaceState({}, '', url.toString());
    return;
  }

  window.history.pushState({}, '', url.toString());
}

export function useBirdMigrationPage() {
  let seasonsResponse = $state<BirdMigrationSeasonsResponse | null>(null);
  let selectedSeasonStart = $state('');
  let migrationData = $state<BirdMigrationDerivedData | null>(null);
  let isMetadataLoading = $state(false);
  let isLoading = $state(false);
  let isThumbnailLoading = $state(false);
  let error = $state<string | null>(null);
  let requestId = 0;

  const displaySeasons = $derived.by((): BirdMigrationDisplaySeason[] =>
    seasonsResponse ? buildBirdMigrationDisplaySeasons(seasonsResponse.seasons) : []
  );

  const hasAvailableSeasons = $derived.by(() =>
    Boolean(seasonsResponse?.enabled && displaySeasons.length > 0)
  );

  const selectedSeason = $derived.by(() =>
    findBirdMigrationSeason(displaySeasons, selectedSeasonStart)
  );

  const previousSeasonStart = $derived.by(() =>
    getBirdMigrationAdjacentSeasonStart(displaySeasons, selectedSeasonStart, 'previous')
  );

  const nextSeasonStart = $derived.by(() =>
    getBirdMigrationAdjacentSeasonStart(displaySeasons, selectedSeasonStart, 'next')
  );

  const observedEndDate = $derived.by(() =>
    selectedSeason ? getBirdMigrationObservedEndDate(selectedSeason) : ''
  );

  const windowDays = $derived(seasonsResponse?.window_days ?? 0);

  function syncSelectedSeasonFromUrl(replaceState = false): void {
    if (!seasonsResponse?.enabled || displaySeasons.length === 0) {
      selectedSeasonStart = '';
      return;
    }

    const requestedSeasonStart = readBirdMigrationSeasonStartFromUrl();
    const nextSeasonStart = resolveBirdMigrationSelectedSeasonStart(
      displaySeasons,
      seasonsResponse.current_season_start,
      requestedSeasonStart
    );
    if (!nextSeasonStart) {
      return;
    }

    selectedSeasonStart = nextSeasonStart;
    if (replaceState || requestedSeasonStart !== nextSeasonStart) {
      writeBirdMigrationSeasonStartToUrl(nextSeasonStart, true);
    }
  }

  function setSelectedSeasonStart(seasonStart: string): void {
    if (!seasonStart || seasonStart === selectedSeasonStart) {
      return;
    }

    selectedSeasonStart = seasonStart;
    writeBirdMigrationSeasonStartToUrl(seasonStart);
  }

  function handleSeasonChange(value: string | string[]): void {
    if (typeof value !== 'string') {
      return;
    }

    setSelectedSeasonStart(value);
  }

  function handlePopState(): void {
    syncSelectedSeasonFromUrl();
  }

  function openDetections(speciesName: string, sortBy: BirdMigrationDetectionsSortBy): void {
    if (!selectedSeason || !observedEndDate) {
      navigation.navigate('/ui/detections');
      return;
    }

    navigation.navigate(
      buildBirdMigrationDetectionsUrl(speciesName, selectedSeason, observedEndDate, sortBy)
    );
  }

  function applyThumbnails(thumbnails: Record<string, string>): void {
    if (!migrationData) {
      return;
    }

    migrationData = {
      ...migrationData,
      roster: mergeBirdMigrationRowsWithThumbnails(migrationData.roster, thumbnails),
      recentArrivals: mergeBirdMigrationRowsWithThumbnails(
        migrationData.recentArrivals,
        thumbnails
      ),
      quietSpecies: mergeBirdMigrationRowsWithThumbnails(migrationData.quietSpecies, thumbnails),
      disappearances: mergeBirdMigrationRowsWithThumbnails(
        migrationData.disappearances,
        thumbnails
      ),
    };
  }

  async function loadThumbnails(rows: BirdMigrationSpeciesRecord[], currentRequestId: number) {
    const scientificNames = rows.filter(row => !row.thumbnail_url).map(row => row.scientific_name);
    if (scientificNames.length === 0) {
      return;
    }

    isThumbnailLoading = true;
    const thumbnailMap: Record<string, string> = {};

    try {
      for (let index = 0; index < scientificNames.length; index += THUMBNAIL_BATCH_SIZE) {
        if (currentRequestId !== requestId) {
          return;
        }

        const batch = scientificNames.slice(index, index + THUMBNAIL_BATCH_SIZE);
        const params = new URLSearchParams();
        batch.forEach(name => params.append('species', name));

        const response = await fetch(
          buildAppUrl(`/api/v2/analytics/species/thumbnails?${params.toString()}`)
        );
        if (!response.ok) {
          continue;
        }

        const thumbnails = (await response.json()) as Record<string, string>;
        Object.assign(thumbnailMap, thumbnails);
        applyThumbnails(thumbnailMap);

        if (index + THUMBNAIL_BATCH_SIZE < scientificNames.length) {
          await new Promise(resolve => setTimeout(resolve, THUMBNAIL_BATCH_DELAY_MS));
        }
      }
    } catch (thumbnailError) {
      logger.error('Failed to load bird migration thumbnails:', thumbnailError);
    } finally {
      if (currentRequestId === requestId) {
        isThumbnailLoading = false;
      }
    }
  }

  async function loadSeasonMetadata(): Promise<void> {
    isMetadataLoading = true;
    error = null;

    try {
      const response = await fetch(buildAppUrl('/api/v2/analytics/bird-migration/seasons'));
      if (!response.ok) {
        throw new Error(t('analytics.birdMigration.errors.loadFailed'));
      }

      seasonsResponse = (await response.json()) as BirdMigrationSeasonsResponse;
      syncSelectedSeasonFromUrl(true);
    } catch (loadError) {
      logger.error('Failed to load bird migration seasons:', loadError);
      error =
        loadError instanceof Error
          ? loadError.message
          : t('analytics.birdMigration.errors.loadFailed');
      seasonsResponse = null;
      selectedSeasonStart = '';
      migrationData = null;
    } finally {
      isMetadataLoading = false;
    }
  }

  async function loadBirdMigrationData(
    season: BirdMigrationSeason,
    currentObservedEndDate: string
  ): Promise<void> {
    const currentRequestId = ++requestId;
    isLoading = true;
    isThumbnailLoading = false;
    error = null;

    try {
      const params = new URLSearchParams({
        start_date: season.start_date,
        end_date: currentObservedEndDate,
      });

      const [speciesResponse, dailyResponse, diversityResponse, disappearancesResponse] =
        await Promise.all([
          fetch(buildAppUrl(`/api/v2/analytics/species/summary?${params.toString()}`)),
          fetch(buildAppUrl(`/api/v2/analytics/time/daily?${params.toString()}`)),
          fetch(buildAppUrl(`/api/v2/analytics/species/diversity?${params.toString()}`)),
          fetch(
            buildAppUrl(`/api/v2/analytics/bird-migration/disappearances?${params.toString()}`)
          ),
        ]);

      if (
        !speciesResponse.ok ||
        !dailyResponse.ok ||
        !diversityResponse.ok ||
        !disappearancesResponse.ok
      ) {
        throw new Error(t('analytics.birdMigration.errors.loadFailed'));
      }

      const species = (await speciesResponse.json()) as BirdMigrationSpeciesSummary[];
      const daily = (await dailyResponse.json()) as DailyAnalyticsResponse;
      const diversity = (await diversityResponse.json()) as DiversityAnalyticsResponse;
      const disappearances =
        (await disappearancesResponse.json()) as BirdMigrationDisappearancesResponse;

      if (currentRequestId !== requestId) {
        return;
      }

      migrationData = deriveBirdMigrationAnalytics(
        species,
        daily.data ?? [],
        diversity.data ?? [],
        disappearances.data ?? [],
        season,
        currentObservedEndDate,
        windowDays
      );

      if (migrationData.roster.length > 0) {
        void loadThumbnails(migrationData.roster, currentRequestId);
      }
    } catch (loadError) {
      logger.error('Failed to load bird migration analytics:', loadError);
      error =
        loadError instanceof Error
          ? loadError.message
          : t('analytics.birdMigration.errors.loadFailed');
      migrationData = null;
    } finally {
      if (currentRequestId === requestId) {
        isLoading = false;
      }
    }
  }

  $effect(() => {
    if (!selectedSeason || !hasAvailableSeasons || !observedEndDate) {
      migrationData = null;
      isLoading = false;
      isThumbnailLoading = false;
      return;
    }

    void loadBirdMigrationData(selectedSeason, observedEndDate);
  });

  onMount(() => {
    void loadSeasonMetadata();
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  });

  return {
    get seasonsResponse() {
      return seasonsResponse;
    },
    get selectedSeasonStart() {
      return selectedSeasonStart;
    },
    get migrationData() {
      return migrationData;
    },
    get isMetadataLoading() {
      return isMetadataLoading;
    },
    get isLoading() {
      return isLoading;
    },
    get isThumbnailLoading() {
      return isThumbnailLoading;
    },
    get error() {
      return error;
    },
    get displaySeasons() {
      return displaySeasons;
    },
    get hasAvailableSeasons() {
      return hasAvailableSeasons;
    },
    get selectedSeason() {
      return selectedSeason;
    },
    get previousSeasonStart() {
      return previousSeasonStart;
    },
    get nextSeasonStart() {
      return nextSeasonStart;
    },
    get observedEndDate() {
      return observedEndDate;
    },
    get windowDays() {
      return windowDays;
    },
    setSelectedSeasonStart,
    handleSeasonChange,
    openDetections,
  };
}
