import { onMount } from 'svelte';

import { t } from '$lib/i18n';
import { navigation } from '$lib/stores/navigation.svelte';
import { parseLocalDateString } from '$lib/utils/date';
import { loggers } from '$lib/utils/logger';
import { buildAppUrl } from '$lib/utils/urlHelpers';

import {
  buildBirdMigrationDetectionsUrl,
  buildBirdMigrationDisplaySeasons,
  findBirdMigrationSeason,
  getBirdMigrationAdjacentSeasonStart,
} from '../utils/birdMigrationDisplay';
import type {
  BirdMigrationDisplaySeason,
  BirdMigrationDetectionsSortBy,
  BirdMigrationPageResponse,
} from '../utils/birdMigrationTypes';

const logger = loggers.analytics;

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
  let pageData = $state<BirdMigrationPageResponse | null>(null);
  let isLoading = $state(false);
  let error = $state<string | null>(null);
  let activeRequest = $state<AbortController | null>(null);

  const displaySeasons = $derived.by((): BirdMigrationDisplaySeason[] =>
    pageData ? buildBirdMigrationDisplaySeasons(pageData.seasons) : []
  );

  const selectedSeasonStart = $derived(pageData?.selected_season_start ?? '');
  const hasAvailableSeasons = $derived.by(() =>
    Boolean(pageData?.enabled && displaySeasons.length > 0)
  );
  const selectedSeason = $derived.by(() =>
    findBirdMigrationSeason(displaySeasons, selectedSeasonStart)
  );
  const currentSeasonStart = $derived.by(
    () => pageData?.seasons.find(season => season.is_current)?.start_date ?? ''
  );
  const previousSeasonStart = $derived.by(() =>
    getBirdMigrationAdjacentSeasonStart(displaySeasons, selectedSeasonStart, 'previous')
  );
  const nextSeasonStart = $derived.by(() =>
    getBirdMigrationAdjacentSeasonStart(displaySeasons, selectedSeasonStart, 'next')
  );
  const observedEndDate = $derived(pageData?.observed_end_date ?? '');
  const windowDays = $derived(pageData?.window_days ?? 0);

  async function loadBirdMigrationPage(
    requestedSeasonStart: string | null,
    replaceState = false
  ): Promise<void> {
    activeRequest?.abort();

    const abortController = new AbortController();
    activeRequest = abortController;
    isLoading = true;
    error = null;

    try {
      const params = new URLSearchParams();
      if (requestedSeasonStart) {
        params.set('season_start', requestedSeasonStart);
      }

      const search = params.toString();
      const response = await fetch(
        buildAppUrl(
          search
            ? `/api/v2/analytics/bird-migration/page?${search}`
            : '/api/v2/analytics/bird-migration/page'
        ),
        { signal: abortController.signal }
      );
      if (!response.ok) {
        throw new Error(t('analytics.birdMigration.errors.loadFailed'));
      }

      const nextPageData = (await response.json()) as BirdMigrationPageResponse;
      pageData = nextPageData;

      if (
        nextPageData.selected_season_start &&
        (replaceState ||
          readBirdMigrationSeasonStartFromUrl() !== nextPageData.selected_season_start)
      ) {
        writeBirdMigrationSeasonStartToUrl(nextPageData.selected_season_start, true);
      }
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === 'AbortError') {
        return;
      }

      logger.error('Failed to load bird migration page:', loadError);
      error =
        loadError instanceof Error
          ? loadError.message
          : t('analytics.birdMigration.errors.loadFailed');
      pageData = null;
    } finally {
      if (activeRequest === abortController) {
        activeRequest = null;
        isLoading = false;
      }
    }
  }

  function setSelectedSeasonStart(seasonStart: string): void {
    if (!seasonStart || seasonStart === selectedSeasonStart) {
      return;
    }

    writeBirdMigrationSeasonStartToUrl(seasonStart);
    void loadBirdMigrationPage(seasonStart);
  }

  function handleSeasonChange(value: string | string[]): void {
    if (typeof value !== 'string') {
      return;
    }

    setSelectedSeasonStart(value);
  }

  function handlePopState(): void {
    void loadBirdMigrationPage(readBirdMigrationSeasonStartFromUrl(), true);
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

  onMount(() => {
    void loadBirdMigrationPage(readBirdMigrationSeasonStartFromUrl(), true);
    window.addEventListener('popstate', handlePopState);

    return () => {
      activeRequest?.abort();
      window.removeEventListener('popstate', handlePopState);
    };
  });

  return {
    get pageData() {
      return pageData;
    },
    get isLoading() {
      return isLoading;
    },
    get error() {
      return error;
    },
    get displaySeasons() {
      return displaySeasons;
    },
    get selectedSeasonStart() {
      return selectedSeasonStart;
    },
    get hasAvailableSeasons() {
      return hasAvailableSeasons;
    },
    get selectedSeason() {
      return selectedSeason;
    },
    get currentSeasonStart() {
      return currentSeasonStart;
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
