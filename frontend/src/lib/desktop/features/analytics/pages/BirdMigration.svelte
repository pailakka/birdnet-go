<script lang="ts">
  import { onMount } from 'svelte';
  import { Bird, CalendarRange, ChevronLeft, ChevronRight, Clock3, Volume2 } from '@lucide/svelte';

  import type { SelectOption } from '$lib/desktop/components/forms/SelectDropdown.types';
  import SelectDropdown from '$lib/desktop/components/forms/SelectDropdown.svelte';
  import EmptyState from '$lib/desktop/components/ui/EmptyState.svelte';
  import ErrorAlert from '$lib/desktop/components/ui/ErrorAlert.svelte';
  import { handleBirdImageError } from '$lib/desktop/components/ui/image-utils';
  import { t } from '$lib/i18n';
  import { navigation } from '$lib/stores/navigation.svelte';
  import { parseLocalDateString } from '$lib/utils/date';
  import { loggers } from '$lib/utils/logger';
  import { buildAppUrl } from '$lib/utils/urlHelpers';

  import BirdMigrationActivityChart from '../components/charts/d3/BirdMigrationActivityChart.svelte';
  import BirdMigrationArrivalChart from '../components/charts/d3/BirdMigrationArrivalChart.svelte';
  import StatCard from '../components/ui/StatCard.svelte';
  import {
    deriveBirdMigrationAnalytics,
    findBirdMigrationSeason,
    getBirdMigrationObservedEndDate,
    type BirdMigrationDailyDetections,
    type BirdMigrationDailyDiversity,
    type BirdMigrationDisappearanceRecord,
    type BirdMigrationDerivedData,
    type BirdMigrationSeason,
    type BirdMigrationSpeciesRecord,
    type BirdMigrationSpeciesSummary,
  } from '../utils/birdMigration';

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
  const DEFAULT_RESULTS_LIMIT = '100';

  let seasonsResponse = $state<BirdMigrationSeasonsResponse | null>(null);
  let selectedSeasonStart = $state('');
  let migrationData = $state<BirdMigrationDerivedData | null>(null);
  let isMetadataLoading = $state(false);
  let isLoading = $state(false);
  let isThumbnailLoading = $state(false);
  let error = $state<string | null>(null);
  let requestId = 0;

  const hasAvailableSeasons = $derived.by(() =>
    Boolean(seasonsResponse?.enabled && seasonsResponse.seasons.length > 0)
  );

  const seasonOptions = $derived.by(
    (): SelectOption[] =>
      seasonsResponse?.seasons.map(season => ({
        value: season.start_date,
        label: season.label,
      })) ?? []
  );

  const selectedSeason = $derived.by(() =>
    seasonsResponse ? findBirdMigrationSeason(seasonsResponse.seasons, selectedSeasonStart) : null
  );

  const selectedSeasonIndex = $derived.by(() => {
    if (!selectedSeason || !seasonsResponse) {
      return -1;
    }

    return seasonsResponse.seasons.findIndex(
      season => season.start_date === selectedSeason.start_date
    );
  });

  const observedEndDate = $derived.by(() =>
    selectedSeason ? getBirdMigrationObservedEndDate(selectedSeason) : ''
  );

  const windowDays = $derived(seasonsResponse?.window_days ?? 0);

  function readSeasonStartFromUrl(): string | null {
    const params = new URLSearchParams(window.location.search);
    const seasonStart = params.get('season_start');
    if (!seasonStart) {
      return null;
    }

    return parseLocalDateString(seasonStart) ? seasonStart : null;
  }

  function writeSeasonStartToUrl(seasonStart: string, replaceState = false): void {
    const url = new URL(window.location.href);
    url.searchParams.set('season_start', seasonStart);

    if (replaceState) {
      window.history.replaceState({}, '', url.toString());
      return;
    }

    window.history.pushState({}, '', url.toString());
  }

  function syncSelectedSeasonFromUrl(replaceState = false): void {
    if (!seasonsResponse?.enabled || seasonsResponse.seasons.length === 0) {
      selectedSeasonStart = '';
      return;
    }

    const requestedSeasonStart = readSeasonStartFromUrl();
    const matchedSeason =
      requestedSeasonStart &&
      seasonsResponse.seasons.find(season => season.start_date === requestedSeasonStart);

    const nextSeasonStart = matchedSeason
      ? requestedSeasonStart
      : seasonsResponse.current_season_start || seasonsResponse.seasons[0].start_date;

    if (!nextSeasonStart) {
      return;
    }

    selectedSeasonStart = nextSeasonStart;

    if (replaceState || requestedSeasonStart !== nextSeasonStart) {
      writeSeasonStartToUrl(nextSeasonStart, true);
    }
  }

  function setSelectedSeasonStart(seasonStart: string): void {
    if (!seasonStart || seasonStart === selectedSeasonStart) {
      return;
    }

    selectedSeasonStart = seasonStart;
    writeSeasonStartToUrl(seasonStart);
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

  function formatDate(dateString: string): string {
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

  function parseApiDateTime(dateString: string): Date | null {
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dateString)) {
      return parseLocalDateString(dateString.replace(' ', 'T'));
    }

    return parseLocalDateString(dateString);
  }

  function formatDateTime(dateString: string): string {
    const parsed = parseApiDateTime(dateString);
    if (!parsed) {
      return dateString;
    }

    return parsed.toLocaleString();
  }

  function formatInteger(value: number): string {
    return new Intl.NumberFormat().format(value);
  }

  function getSpeciesInitials(commonName: string): string {
    return commonName.slice(0, 2).toUpperCase();
  }

  function getPreviousSeasonStart(): string | null {
    if (!seasonsResponse || selectedSeasonIndex <= 0) {
      return null;
    }

    return seasonsResponse.seasons[selectedSeasonIndex - 1]?.start_date ?? null;
  }

  function getNextSeasonStart(): string | null {
    if (!seasonsResponse || selectedSeasonIndex < 0) {
      return null;
    }

    return seasonsResponse.seasons[selectedSeasonIndex + 1]?.start_date ?? null;
  }

  function buildDetectionsUrl(speciesName: string, sortBy: 'date_asc' | 'date_desc'): string {
    if (!selectedSeason || !observedEndDate) {
      return '/ui/detections';
    }

    const params = new URLSearchParams({
      queryType: 'species',
      species: speciesName,
      start_date: selectedSeason.start_date,
      end_date: observedEndDate,
      sortBy,
      numResults: DEFAULT_RESULTS_LIMIT,
      offset: '0',
    });

    return `/ui/detections?${params.toString()}`;
  }

  function openDetections(speciesName: string, sortBy: 'date_asc' | 'date_desc'): void {
    navigation.navigate(buildDetectionsUrl(speciesName, sortBy));
  }

  interface BirdMigrationThumbnailRow {
    scientific_name: string;
    thumbnail_url?: string;
  }

  function updateRowsWithThumbnails<T extends BirdMigrationThumbnailRow>(
    rows: T[],
    thumbnails: Record<string, string>
  ): T[] {
    return rows.map(row => {
      const thumbnailUrl = thumbnails[row.scientific_name];
      return thumbnailUrl ? { ...row, thumbnail_url: thumbnailUrl } : row;
    });
  }

  function applyThumbnails(thumbnails: Record<string, string>): void {
    if (!migrationData) {
      return;
    }

    migrationData = {
      ...migrationData,
      roster: updateRowsWithThumbnails(migrationData.roster, thumbnails),
      recentArrivals: updateRowsWithThumbnails(migrationData.recentArrivals, thumbnails),
      quietSpecies: updateRowsWithThumbnails(migrationData.quietSpecies, thumbnails),
      disappearances: updateRowsWithThumbnails(migrationData.disappearances, thumbnails),
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
</script>

<div class="col-span-12 space-y-4" role="region" aria-label={t('analytics.birdMigration.title')}>
  <div class="card bg-[var(--color-base-100)] shadow-xs">
    <div class="card-body card-padding">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <CalendarRange class="size-5 text-[var(--color-primary)]" />
            <h1 class="card-title text-2xl">{t('analytics.birdMigration.title')}</h1>
          </div>
          <p class="text-[var(--color-base-content)] opacity-70">
            {t('analytics.birdMigration.subtitle')}
          </p>

          {#if selectedSeason}
            <div
              class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--color-base-content)] opacity-70"
            >
              <span>
                {t('analytics.birdMigration.season.current', {
                  season: selectedSeason.label,
                })}
              </span>
              <span>
                {t('analytics.birdMigration.season.range', {
                  start: formatDate(selectedSeason.start_date),
                  end: formatDate(selectedSeason.end_date),
                })}
              </span>
              {#if selectedSeason.is_current}
                <span>
                  {t('analytics.birdMigration.season.observedThrough', {
                    date: formatDate(observedEndDate),
                  })}
                </span>
              {/if}
            </div>
          {/if}
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="btn btn-sm btn-outline"
            onclick={() => {
              const previousSeasonStart = getPreviousSeasonStart();
              if (previousSeasonStart) {
                setSelectedSeasonStart(previousSeasonStart);
              }
            }}
            disabled={!selectedSeason || selectedSeasonIndex <= 0}
          >
            <ChevronLeft class="size-4" />
            {t('analytics.birdMigration.controls.previousSeason')}
          </button>

          <div class="w-64 min-w-48">
            <SelectDropdown
              options={seasonOptions}
              value={selectedSeasonStart}
              placeholder={t('analytics.birdMigration.controls.season')}
              size="sm"
              onChange={handleSeasonChange}
            />
          </div>

          <button
            type="button"
            class="btn btn-sm btn-outline"
            onclick={() =>
              seasonsResponse?.current_season_start &&
              setSelectedSeasonStart(seasonsResponse.current_season_start)}
            disabled={!seasonsResponse?.current_season_start ||
              seasonsResponse.current_season_start === selectedSeasonStart}
          >
            {t('analytics.birdMigration.controls.currentSeason')}
          </button>

          <button
            type="button"
            class="btn btn-sm btn-outline"
            onclick={() => {
              const nextSeasonStart = getNextSeasonStart();
              if (nextSeasonStart) {
                setSelectedSeasonStart(nextSeasonStart);
              }
            }}
            disabled={!selectedSeason || !getNextSeasonStart()}
          >
            {t('analytics.birdMigration.controls.nextSeason')}
            <ChevronRight class="size-4" />
          </button>
        </div>
      </div>
    </div>
  </div>

  {#if error}
    <ErrorAlert message={error} />
  {/if}

  {#if !isMetadataLoading && seasonsResponse && !hasAvailableSeasons}
    <div class="card bg-[var(--color-base-100)] shadow-xs">
      <div class="card-body">
        <EmptyState
          title={t('analytics.birdMigration.states.disabledTitle')}
          description={t('analytics.birdMigration.states.disabledDescription')}
        />
      </div>
    </div>
  {:else if hasAvailableSeasons && selectedSeason}
    <div class="grid grid-cols-1 gap-4 xl:grid-cols-4">
      <StatCard
        title={t('analytics.birdMigration.stats.seasonSpecies')}
        value={migrationData ? formatInteger(migrationData.summary.speciesCount) : 0}
        subtitle={selectedSeason.label}
        isLoading={isMetadataLoading || isLoading}
        iconClassName="bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
      >
        {#snippet icon()}
          <Bird class="size-6" />
        {/snippet}
      </StatCard>

      <StatCard
        title={t('analytics.birdMigration.stats.recentArrivals')}
        value={migrationData ? formatInteger(migrationData.summary.recentArrivalsCount) : 0}
        subtitle={t('analytics.birdMigration.stats.windowDays', { days: windowDays })}
        isLoading={isMetadataLoading || isLoading}
        iconClassName="bg-[var(--color-success)]/15 text-[var(--color-success)]"
      >
        {#snippet icon()}
          <CalendarRange class="size-6" />
        {/snippet}
      </StatCard>

      <StatCard
        title={t('analytics.birdMigration.stats.quietSpecies')}
        value={migrationData ? formatInteger(migrationData.summary.quietSpeciesCount) : 0}
        subtitle={t('analytics.birdMigration.stats.windowDays', { days: windowDays })}
        isLoading={isMetadataLoading || isLoading}
        iconClassName="bg-[var(--color-warning)]/15 text-[var(--color-warning)]"
      >
        {#snippet icon()}
          <Clock3 class="size-6" />
        {/snippet}
      </StatCard>

      <StatCard
        title={t('analytics.birdMigration.stats.seasonDetections')}
        value={migrationData ? formatInteger(migrationData.summary.detectionCount) : 0}
        subtitle={selectedSeason.is_current
          ? t('analytics.birdMigration.season.observedThrough', {
              date: formatDate(observedEndDate),
            })
          : formatDate(selectedSeason.end_date)}
        isLoading={isMetadataLoading || isLoading}
        iconClassName="bg-[var(--color-secondary)]/15 text-[var(--color-secondary)]"
      >
        {#snippet icon()}
          <Volume2 class="size-6" />
        {/snippet}
      </StatCard>
    </div>

    <div class="card bg-[var(--color-base-100)] shadow-xs">
      <div class="card-body p-4 md:p-6">
        <div class="space-y-2 text-sm text-[var(--color-base-content)] opacity-80">
          <p>{t('analytics.birdMigration.tables.explainerRecent', { days: windowDays })}</p>
          <p>{t('analytics.birdMigration.tables.explainerQuiet', { days: windowDays })}</p>
          <p>{t('analytics.birdMigration.tables.explainerDisappearances', { days: windowDays })}</p>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div class="card bg-[var(--color-base-100)] shadow-xs">
        <div class="card-body p-4 md:p-6">
          <div class="space-y-1">
            <h2 class="card-title">{t('analytics.birdMigration.charts.arrivals.title')}</h2>
            <p class="text-sm text-[var(--color-base-content)] opacity-70">
              {t('analytics.birdMigration.charts.arrivals.description')}
            </p>
          </div>

          {#if !isLoading && migrationData && migrationData.arrivalTimeline.length > 0}
            <div class="mt-4 h-80">
              <BirdMigrationArrivalChart data={migrationData.arrivalTimeline} />
            </div>
          {:else}
            <div class="py-8 text-center text-sm text-[var(--color-base-content)] opacity-60">
              {t('analytics.charts.noDataAvailable')}
            </div>
          {/if}
        </div>
      </div>

      <div class="card bg-[var(--color-base-100)] shadow-xs">
        <div class="card-body p-4 md:p-6">
          <div class="space-y-1">
            <h2 class="card-title">{t('analytics.birdMigration.charts.activity.title')}</h2>
            <p class="text-sm text-[var(--color-base-content)] opacity-70">
              {t('analytics.birdMigration.charts.activity.description')}
            </p>
          </div>

          {#if !isLoading && migrationData && migrationData.activityTimeline.length > 0}
            <div class="mt-4 h-80">
              <BirdMigrationActivityChart data={migrationData.activityTimeline} />
            </div>
          {:else}
            <div class="py-8 text-center text-sm text-[var(--color-base-content)] opacity-60">
              {t('analytics.charts.noDataAvailable')}
            </div>
          {/if}
        </div>
      </div>
    </div>

    {#if migrationData}
      <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div class="card bg-[var(--color-base-100)] shadow-xs">
          <div class="card-body p-4 md:p-6">
            <div class="flex items-center justify-between gap-3">
              <div>
                <h2 class="card-title">{t('analytics.birdMigration.tables.recentArrivals')}</h2>
                <p class="text-sm text-[var(--color-base-content)] opacity-70">
                  {t('analytics.birdMigration.tables.recentArrivalsDescription')}
                </p>
              </div>
              <span class="text-sm text-[var(--color-base-content)] opacity-70">
                {formatInteger(migrationData.recentArrivals.length)}
              </span>
            </div>

            {#if migrationData.recentArrivals.length === 0}
              <EmptyState
                title={t('analytics.birdMigration.tables.emptyTitle')}
                description={t('analytics.birdMigration.tables.noRecentArrivals')}
                className="py-8"
              />
            {:else}
              <div class="overflow-x-auto">
                <table class="table table-sm mt-4">
                  <thead>
                    <tr>
                      <th>{t('analytics.birdMigration.tables.columns.species')}</th>
                      <th>{t('analytics.birdMigration.tables.columns.firstHeard')}</th>
                      <th>{t('analytics.birdMigration.tables.columns.activeDays')}</th>
                      <th>{t('analytics.birdMigration.tables.columns.detections')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each migrationData.recentArrivals as species}
                      <tr class="hover">
                        <td>
                          <button
                            type="button"
                            class="flex items-center gap-3 text-left"
                            onclick={() => openDetections(species.scientific_name, 'date_asc')}
                          >
                            {#if species.thumbnail_url}
                              <img
                                src={species.thumbnail_url}
                                alt={species.common_name}
                                class="size-10 rounded-lg object-cover"
                                onerror={handleBirdImageError}
                              />
                            {:else}
                              <div
                                class="size-10 rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center text-xs font-semibold"
                              >
                                {getSpeciesInitials(species.common_name)}
                              </div>
                            {/if}
                            <span>
                              <span class="block font-medium">{species.common_name}</span>
                              <span class="block text-xs opacity-60 italic"
                                >{species.scientific_name}</span
                              >
                            </span>
                          </button>
                        </td>
                        <td title={formatDateTime(species.first_heard)}>
                          {formatDate(species.first_heard_date)}
                        </td>
                        <td>{formatInteger(species.active_days)}</td>
                        <td>{formatInteger(species.count)}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          </div>
        </div>

        <div class="card bg-[var(--color-base-100)] shadow-xs">
          <div class="card-body p-4 md:p-6">
            <div class="flex items-center justify-between gap-3">
              <div>
                <h2 class="card-title">{t('analytics.birdMigration.tables.quietSpecies')}</h2>
                <p class="text-sm text-[var(--color-base-content)] opacity-70">
                  {t('analytics.birdMigration.tables.quietSpeciesDescription')}
                </p>
              </div>
              <span class="text-sm text-[var(--color-base-content)] opacity-70">
                {formatInteger(migrationData.quietSpecies.length)}
              </span>
            </div>

            {#if migrationData.quietSpecies.length === 0}
              <EmptyState
                title={t('analytics.birdMigration.tables.emptyTitle')}
                description={t('analytics.birdMigration.tables.noQuietSpecies')}
                className="py-8"
              />
            {:else}
              <div class="overflow-x-auto">
                <table class="table table-sm mt-4">
                  <thead>
                    <tr>
                      <th>{t('analytics.birdMigration.tables.columns.species')}</th>
                      <th>{t('analytics.birdMigration.tables.columns.lastHeard')}</th>
                      <th>{t('analytics.birdMigration.tables.columns.daysQuiet')}</th>
                      <th>{t('analytics.birdMigration.tables.columns.activeDays')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each migrationData.quietSpecies as species}
                      <tr class="hover">
                        <td>
                          <button
                            type="button"
                            class="flex items-center gap-3 text-left"
                            onclick={() => openDetections(species.scientific_name, 'date_desc')}
                          >
                            {#if species.thumbnail_url}
                              <img
                                src={species.thumbnail_url}
                                alt={species.common_name}
                                class="size-10 rounded-lg object-cover"
                                onerror={handleBirdImageError}
                              />
                            {:else}
                              <div
                                class="size-10 rounded-lg bg-[var(--color-warning)]/10 text-[var(--color-warning)] flex items-center justify-center text-xs font-semibold"
                              >
                                {getSpeciesInitials(species.common_name)}
                              </div>
                            {/if}
                            <span>
                              <span class="block font-medium">{species.common_name}</span>
                              <span class="block text-xs opacity-60 italic"
                                >{species.scientific_name}</span
                              >
                            </span>
                          </button>
                        </td>
                        <td title={formatDateTime(species.last_heard)}>
                          {formatDate(species.last_heard_date)}
                        </td>
                        <td>{formatInteger(species.days_since_last_seen)}</td>
                        <td>{formatInteger(species.active_days)}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          </div>
        </div>
      </div>

      <div class="card bg-[var(--color-base-100)] shadow-xs">
        <div class="card-body p-4 md:p-6">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="card-title">{t('analytics.birdMigration.tables.disappearances')}</h2>
              <p class="text-sm text-[var(--color-base-content)] opacity-70">
                {t('analytics.birdMigration.tables.disappearancesDescription')}
              </p>
            </div>
            <span class="text-sm text-[var(--color-base-content)] opacity-70">
              {formatInteger(migrationData.disappearances.length)}
            </span>
          </div>

          {#if migrationData.disappearances.length === 0}
            <EmptyState
              title={t('analytics.birdMigration.tables.emptyTitle')}
              description={t('analytics.birdMigration.tables.noDisappearances')}
              className="py-8"
            />
          {:else}
            <div class="overflow-x-auto">
              <table class="table table-sm mt-4">
                <thead>
                  <tr>
                    <th>{t('analytics.birdMigration.tables.columns.species')}</th>
                    <th>{t('analytics.birdMigration.tables.columns.lastHeardBeforeGap')}</th>
                    <th>{t('analytics.birdMigration.tables.columns.returnedOn')}</th>
                    <th>{t('analytics.birdMigration.tables.columns.gapDays')}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each migrationData.disappearances as species}
                    <tr class="hover">
                      <td>
                        <button
                          type="button"
                          class="flex items-center gap-3 text-left"
                          onclick={() => openDetections(species.scientific_name, 'date_asc')}
                        >
                          {#if species.thumbnail_url}
                            <img
                              src={species.thumbnail_url}
                              alt={species.common_name}
                              class="size-10 rounded-lg object-cover"
                              onerror={handleBirdImageError}
                            />
                          {:else}
                            <div
                              class="size-10 rounded-lg bg-[var(--color-info)]/10 text-[var(--color-info)] flex items-center justify-center text-xs font-semibold"
                            >
                              {getSpeciesInitials(species.common_name)}
                            </div>
                          {/if}
                          <span>
                            <span class="block font-medium">{species.common_name}</span>
                            <span class="block text-xs opacity-60 italic"
                              >{species.scientific_name}</span
                            >
                          </span>
                        </button>
                      </td>
                      <td>{formatDate(species.last_heard_before_gap)}</td>
                      <td>{formatDate(species.returned_on)}</td>
                      <td>{formatInteger(species.gap_days)}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      </div>

      <div class="card bg-[var(--color-base-100)] shadow-xs">
        <div class="card-body p-4 md:p-6">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="card-title">{t('analytics.birdMigration.tables.roster')}</h2>
              <p class="text-sm text-[var(--color-base-content)] opacity-70">
                {t('analytics.birdMigration.tables.rosterDescription')}
              </p>
            </div>
            <span class="text-sm text-[var(--color-base-content)] opacity-70">
              {isThumbnailLoading
                ? t('analytics.birdMigration.tables.loadingThumbnails')
                : formatInteger(migrationData.roster.length)}
            </span>
          </div>

          {#if migrationData.roster.length === 0}
            <EmptyState
              title={t('analytics.birdMigration.tables.emptyTitle')}
              description={t('analytics.birdMigration.tables.noSeasonDetections')}
              className="py-10"
            />
          {:else}
            <div class="overflow-x-auto">
              <table class="table table-sm mt-4">
                <thead>
                  <tr>
                    <th>{t('analytics.birdMigration.tables.columns.species')}</th>
                    <th>{t('analytics.birdMigration.tables.columns.firstHeard')}</th>
                    <th>{t('analytics.birdMigration.tables.columns.lastHeard')}</th>
                    <th>{t('analytics.birdMigration.tables.columns.activeDays')}</th>
                    <th>{t('analytics.birdMigration.tables.columns.detections')}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each migrationData.roster as species}
                    <tr class="hover">
                      <td>
                        <button
                          type="button"
                          class="flex items-center gap-3 text-left"
                          onclick={() => openDetections(species.scientific_name, 'date_desc')}
                        >
                          {#if species.thumbnail_url}
                            <img
                              src={species.thumbnail_url}
                              alt={species.common_name}
                              class="size-10 rounded-lg object-cover"
                              onerror={handleBirdImageError}
                            />
                          {:else}
                            <div
                              class="size-10 rounded-lg bg-[var(--color-secondary)]/10 text-[var(--color-secondary)] flex items-center justify-center text-xs font-semibold"
                            >
                              {getSpeciesInitials(species.common_name)}
                            </div>
                          {/if}
                          <span>
                            <span class="block font-medium">{species.common_name}</span>
                            <span class="block text-xs opacity-60 italic"
                              >{species.scientific_name}</span
                            >
                          </span>
                        </button>
                      </td>
                      <td title={formatDateTime(species.first_heard)}>
                        {formatDate(species.first_heard_date)}
                      </td>
                      <td title={formatDateTime(species.last_heard)}>
                        {formatDate(species.last_heard_date)}
                      </td>
                      <td>{formatInteger(species.active_days)}</td>
                      <td>{formatInteger(species.count)}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  {/if}
</div>
