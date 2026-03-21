<script lang="ts">
  import { onMount } from 'svelte';
  import { Bird, CalendarRange, Clock3, Volume2, ChevronLeft, ChevronRight } from '@lucide/svelte';

  import EmptyState from '$lib/desktop/components/ui/EmptyState.svelte';
  import ErrorAlert from '$lib/desktop/components/ui/ErrorAlert.svelte';
  import DatePicker from '$lib/desktop/components/ui/DatePicker.svelte';
  import { handleBirdImageError } from '$lib/desktop/components/ui/image-utils';
  import { t } from '$lib/i18n';
  import { appState } from '$lib/stores/appState.svelte';
  import { navigation } from '$lib/stores/navigation.svelte';
  import { getLocalDateString, parseLocalDateString } from '$lib/utils/date';
  import { loggers } from '$lib/utils/logger';
  import { buildAppUrl } from '$lib/utils/urlHelpers';

  import BirdMigrationArrivalChart from '../components/charts/d3/BirdMigrationArrivalChart.svelte';
  import BirdMigrationActivityChart from '../components/charts/d3/BirdMigrationActivityChart.svelte';
  import StatCard from '../components/ui/StatCard.svelte';
  import {
    deriveBirdMigrationAnalytics,
    resolveBirdMigrationSeason,
    type BirdMigrationDailyDetections,
    type BirdMigrationDailyDiversity,
    type BirdMigrationDerivedData,
    type BirdMigrationResolvedSeason,
    type BirdMigrationSpeciesRecord,
    type BirdMigrationSpeciesSummary,
  } from '../utils/birdMigration';

  const logger = loggers.analytics;

  const THUMBNAIL_BATCH_SIZE = 20;
  const THUMBNAIL_BATCH_DELAY_MS = 100;
  const DEFAULT_RESULTS_LIMIT = '100';

  const SEASON_TRANSLATION_KEYS = {
    spring: 'settings.species.tracking.seasonal.seasons.spring',
    summer: 'settings.species.tracking.seasonal.seasons.summer',
    fall: 'settings.species.tracking.seasonal.seasons.fall',
    winter: 'settings.species.tracking.seasonal.seasons.winter',
    wet1: 'settings.species.tracking.seasonal.seasons.wet1',
    dry1: 'settings.species.tracking.seasonal.seasons.dry1',
    wet2: 'settings.species.tracking.seasonal.seasons.wet2',
    dry2: 'settings.species.tracking.seasonal.seasons.dry2',
  } as const;

  interface DailyAnalyticsResponse {
    data?: BirdMigrationDailyDetections[];
  }

  interface DiversityAnalyticsResponse {
    data?: BirdMigrationDailyDiversity[];
  }

  let selectedDate = $state(getLocalDateString());
  let resolvedSeason = $state<BirdMigrationResolvedSeason | null>(null);
  let migrationData = $state<BirdMigrationDerivedData | null>(null);
  let isLoading = $state(false);
  let isThumbnailLoading = $state(false);
  let error = $state<string | null>(null);
  let hasMounted = $state(false);
  let requestId = 0;

  const hasSeasonalTracking = $derived(
    appState.seasonalTracking.enabled && Object.keys(appState.seasonalTracking.seasons).length > 0
  );

  function readDateFromUrl(): string {
    const params = new URLSearchParams(window.location.search);
    const date = params.get('date');
    if (!date) {
      return getLocalDateString();
    }

    return parseLocalDateString(date) ? date : getLocalDateString();
  }

  function writeDateToUrl(date: string): void {
    const url = new URL(window.location.href);
    url.searchParams.set('date', date);
    window.history.pushState({}, '', url.toString());
  }

  function setAnchorDate(date: string): void {
    if (date === selectedDate) {
      return;
    }

    selectedDate = date;
    writeDateToUrl(date);
  }

  function handlePopState(): void {
    selectedDate = readDateFromUrl();
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

  function formatSeasonName(name: string): string {
    if (name in SEASON_TRANSLATION_KEYS) {
      const key = SEASON_TRANSLATION_KEYS[name as keyof typeof SEASON_TRANSLATION_KEYS];
      return t(key);
    }

    return name
      .split(/[_-]/)
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  function buildDetectionsUrl(speciesName: string): string {
    if (!resolvedSeason) {
      return '/ui/detections';
    }

    const params = new URLSearchParams({
      queryType: 'species',
      species: speciesName,
      date: resolvedSeason.startDate,
      start_date: resolvedSeason.startDate,
      end_date: resolvedSeason.queryEndDate,
      numResults: DEFAULT_RESULTS_LIMIT,
      offset: '0',
    });

    return `/ui/detections?${params.toString()}`;
  }

  function openDetections(speciesName: string): void {
    navigation.navigate(buildDetectionsUrl(speciesName));
  }

  function updateRowsWithThumbnails(
    rows: BirdMigrationSpeciesRecord[],
    thumbnails: Record<string, string>
  ): BirdMigrationSpeciesRecord[] {
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

  async function loadBirdMigrationData(currentSeason: BirdMigrationResolvedSeason): Promise<void> {
    const currentRequestId = ++requestId;
    isLoading = true;
    isThumbnailLoading = false;
    error = null;

    try {
      const params = new URLSearchParams({
        start_date: currentSeason.startDate,
        end_date: currentSeason.queryEndDate,
      });

      const [speciesResponse, dailyResponse, diversityResponse] = await Promise.all([
        fetch(buildAppUrl(`/api/v2/analytics/species/summary?${params.toString()}`)),
        fetch(buildAppUrl(`/api/v2/analytics/time/daily?${params.toString()}`)),
        fetch(buildAppUrl(`/api/v2/analytics/species/diversity?${params.toString()}`)),
      ]);

      if (!speciesResponse.ok || !dailyResponse.ok || !diversityResponse.ok) {
        throw new Error(t('analytics.birdMigration.errors.loadFailed'));
      }

      const species = (await speciesResponse.json()) as BirdMigrationSpeciesSummary[];
      const daily = (await dailyResponse.json()) as DailyAnalyticsResponse;
      const diversity = (await diversityResponse.json()) as DiversityAnalyticsResponse;

      if (currentRequestId !== requestId) {
        return;
      }

      migrationData = deriveBirdMigrationAnalytics(
        species,
        daily.data ?? [],
        diversity.data ?? [],
        currentSeason,
        appState.seasonalTracking.windowDays
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
    if (!hasMounted) {
      return;
    }

    const currentDate = selectedDate;
    const seasonalTracking = appState.seasonalTracking;
    const currentResolvedSeason = resolveBirdMigrationSeason(seasonalTracking, currentDate);

    resolvedSeason = currentResolvedSeason;

    if (!currentResolvedSeason) {
      migrationData = null;
      isLoading = false;
      isThumbnailLoading = false;
      error = null;
      return;
    }

    void loadBirdMigrationData(currentResolvedSeason);
  });

  onMount(() => {
    selectedDate = readDateFromUrl();
    hasMounted = true;
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

          {#if resolvedSeason}
            <div
              class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--color-base-content)] opacity-70"
            >
              <span>
                {t('analytics.birdMigration.season.current', {
                  season: formatSeasonName(resolvedSeason.name),
                })}
              </span>
              <span>
                {t('analytics.birdMigration.season.range', {
                  start: formatDate(resolvedSeason.startDate),
                  end: formatDate(resolvedSeason.endDate),
                })}
              </span>
              <span>
                {t('analytics.birdMigration.season.dataThrough', {
                  date: formatDate(resolvedSeason.queryEndDate),
                })}
              </span>
            </div>
          {/if}
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="btn btn-sm btn-outline"
            onclick={() => resolvedSeason && setAnchorDate(resolvedSeason.previousAnchorDate)}
            disabled={!resolvedSeason}
          >
            <ChevronLeft class="size-4" />
            {t('analytics.birdMigration.controls.previousSeason')}
          </button>
          <DatePicker
            value={selectedDate}
            onChange={setAnchorDate}
            maxDate={getLocalDateString()}
            size="sm"
          />
          <button
            type="button"
            class="btn btn-sm btn-outline"
            onclick={() => resolvedSeason && setAnchorDate(resolvedSeason.nextAnchorDate)}
            disabled={!resolvedSeason || resolvedSeason.nextAnchorDate > getLocalDateString()}
          >
            {t('analytics.birdMigration.controls.nextSeason')}
            <ChevronRight class="size-4" />
          </button>
        </div>
      </div>
    </div>
  </div>

  {#if !hasSeasonalTracking}
    <div class="card bg-[var(--color-base-100)] shadow-xs">
      <div class="card-body">
        <EmptyState
          title={t('analytics.birdMigration.states.disabledTitle')}
          description={t('analytics.birdMigration.states.disabledDescription')}
        />
      </div>
    </div>
  {:else}
    {#if error}
      <ErrorAlert message={error} />
    {/if}

    <div class="grid grid-cols-1 gap-4 xl:grid-cols-4">
      <StatCard
        title={t('analytics.birdMigration.stats.seasonSpecies')}
        value={migrationData ? formatInteger(migrationData.summary.speciesCount) : 0}
        subtitle={resolvedSeason ? formatSeasonName(resolvedSeason.name) : undefined}
        {isLoading}
        iconClassName="bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
      >
        {#snippet icon()}
          <Bird class="size-6" />
        {/snippet}
      </StatCard>

      <StatCard
        title={t('analytics.birdMigration.stats.recentArrivals')}
        value={migrationData ? formatInteger(migrationData.summary.recentArrivalsCount) : 0}
        subtitle={t('analytics.birdMigration.stats.windowDays', {
          days: appState.seasonalTracking.windowDays,
        })}
        {isLoading}
        iconClassName="bg-[var(--color-success)]/15 text-[var(--color-success)]"
      >
        {#snippet icon()}
          <CalendarRange class="size-6" />
        {/snippet}
      </StatCard>

      <StatCard
        title={t('analytics.birdMigration.stats.quietSpecies')}
        value={migrationData ? formatInteger(migrationData.summary.quietSpeciesCount) : 0}
        subtitle={t('analytics.birdMigration.stats.windowDays', {
          days: appState.seasonalTracking.windowDays,
        })}
        {isLoading}
        iconClassName="bg-[var(--color-warning)]/15 text-[var(--color-warning)]"
      >
        {#snippet icon()}
          <Clock3 class="size-6" />
        {/snippet}
      </StatCard>

      <StatCard
        title={t('analytics.birdMigration.stats.seasonDetections')}
        value={migrationData ? formatInteger(migrationData.summary.detectionCount) : 0}
        subtitle={resolvedSeason ? formatDate(resolvedSeason.queryEndDate) : undefined}
        {isLoading}
        iconClassName="bg-[var(--color-secondary)]/15 text-[var(--color-secondary)]"
      >
        {#snippet icon()}
          <Volume2 class="size-6" />
        {/snippet}
      </StatCard>
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
                            onclick={() => openDetections(species.scientific_name)}
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
                                {species.common_name.slice(0, 2).toUpperCase()}
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
                        <td>{formatDateTime(species.first_heard)}</td>
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
                            onclick={() => openDetections(species.scientific_name)}
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
                                {species.common_name.slice(0, 2).toUpperCase()}
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
                        <td>{formatDateTime(species.last_heard)}</td>
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
                          onclick={() => openDetections(species.scientific_name)}
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
                              {species.common_name.slice(0, 2).toUpperCase()}
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
                      <td>{formatDateTime(species.first_heard)}</td>
                      <td>{formatDateTime(species.last_heard)}</td>
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
