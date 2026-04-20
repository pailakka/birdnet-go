<script lang="ts">
  import { Bird, CalendarRange, ChevronLeft, ChevronRight, Clock3, Volume2 } from '@lucide/svelte';

  import SelectDropdown from '$lib/desktop/components/forms/SelectDropdown.svelte';
  import EmptyState from '$lib/desktop/components/ui/EmptyState.svelte';
  import ErrorAlert from '$lib/desktop/components/ui/ErrorAlert.svelte';
  import { t } from '$lib/i18n';

  import { useBirdMigrationPage } from '../composables/useBirdMigrationPage.svelte';
  import BirdMigrationActivityChart from '../components/charts/d3/BirdMigrationActivityChart.svelte';
  import BirdMigrationArrivalChart from '../components/charts/d3/BirdMigrationArrivalChart.svelte';
  import BirdMigrationDisappearancesSection from '../components/ui/BirdMigrationDisappearancesSection.svelte';
  import BirdMigrationSpeciesTableSection from '../components/ui/BirdMigrationSpeciesTableSection.svelte';
  import StatCard from '../components/ui/StatCard.svelte';
  import {
    formatBirdMigrationDate,
    formatBirdMigrationNumber,
  } from '../utils/birdMigrationDisplay';

  const birdMigration = useBirdMigrationPage();

  const seasonOptions = $derived.by(() =>
    birdMigration.displaySeasons.map(season => ({
      value: season.start_date,
      label: season.label,
    }))
  );
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

          {#if birdMigration.selectedSeason}
            <div
              class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--color-base-content)] opacity-70"
            >
              <span>
                {t('analytics.birdMigration.season.current', {
                  season: birdMigration.selectedSeason.label,
                })}
              </span>
              <span>
                {t('analytics.birdMigration.season.range', {
                  start: formatBirdMigrationDate(birdMigration.selectedSeason.start_date),
                  end: formatBirdMigrationDate(birdMigration.selectedSeason.end_date),
                })}
              </span>
              {#if birdMigration.selectedSeason.is_current}
                <span>
                  {t('analytics.birdMigration.season.observedThrough', {
                    date: formatBirdMigrationDate(birdMigration.observedEndDate),
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
              if (birdMigration.previousSeasonStart) {
                birdMigration.setSelectedSeasonStart(birdMigration.previousSeasonStart);
              }
            }}
            disabled={!birdMigration.selectedSeason || !birdMigration.previousSeasonStart}
          >
            <ChevronLeft class="size-4" />
            {t('analytics.birdMigration.controls.previousSeason')}
          </button>

          <div class="w-64 min-w-48">
            <SelectDropdown
              options={seasonOptions}
              value={birdMigration.selectedSeasonStart}
              placeholder={t('analytics.birdMigration.controls.season')}
              size="sm"
              onChange={birdMigration.handleSeasonChange}
            />
          </div>

          <button
            type="button"
            class="btn btn-sm btn-outline"
            onclick={() =>
              birdMigration.currentSeasonStart &&
              birdMigration.setSelectedSeasonStart(birdMigration.currentSeasonStart)}
            disabled={!birdMigration.currentSeasonStart ||
              birdMigration.currentSeasonStart === birdMigration.selectedSeasonStart}
          >
            {t('analytics.birdMigration.controls.currentSeason')}
          </button>

          <button
            type="button"
            class="btn btn-sm btn-outline"
            onclick={() => {
              if (birdMigration.nextSeasonStart) {
                birdMigration.setSelectedSeasonStart(birdMigration.nextSeasonStart);
              }
            }}
            disabled={!birdMigration.selectedSeason || !birdMigration.nextSeasonStart}
          >
            {t('analytics.birdMigration.controls.nextSeason')}
            <ChevronRight class="size-4" />
          </button>
        </div>
      </div>
    </div>
  </div>

  {#if birdMigration.error}
    <ErrorAlert message={birdMigration.error} />
  {/if}

  {#if !birdMigration.isLoading && birdMigration.pageData && !birdMigration.hasAvailableSeasons}
    <div class="card bg-[var(--color-base-100)] shadow-xs">
      <div class="card-body">
        <EmptyState
          title={t('analytics.birdMigration.states.disabledTitle')}
          description={t('analytics.birdMigration.states.disabledDescription')}
        />
      </div>
    </div>
  {:else if birdMigration.hasAvailableSeasons && birdMigration.selectedSeason}
    <div class="grid grid-cols-1 gap-4 xl:grid-cols-4">
      <StatCard
        title={t('analytics.birdMigration.stats.seasonSpecies')}
        value={birdMigration.pageData
          ? formatBirdMigrationNumber(birdMigration.pageData.summary.species_count)
          : 0}
        subtitle={birdMigration.selectedSeason.label}
        isLoading={birdMigration.isLoading}
        iconClassName="bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
      >
        {#snippet icon()}
          <Bird class="size-6" />
        {/snippet}
      </StatCard>

      <StatCard
        title={t('analytics.birdMigration.stats.recentArrivals')}
        value={birdMigration.pageData
          ? formatBirdMigrationNumber(birdMigration.pageData.summary.recent_arrivals_count)
          : 0}
        subtitle={t('analytics.birdMigration.stats.windowDays', { days: birdMigration.windowDays })}
        isLoading={birdMigration.isLoading}
        iconClassName="bg-[var(--color-success)]/15 text-[var(--color-success)]"
      >
        {#snippet icon()}
          <CalendarRange class="size-6" />
        {/snippet}
      </StatCard>

      <StatCard
        title={t('analytics.birdMigration.stats.quietSpecies')}
        value={birdMigration.pageData
          ? formatBirdMigrationNumber(birdMigration.pageData.summary.quiet_species_count)
          : 0}
        subtitle={t('analytics.birdMigration.stats.windowDays', { days: birdMigration.windowDays })}
        isLoading={birdMigration.isLoading}
        iconClassName="bg-[var(--color-warning)]/15 text-[var(--color-warning)]"
      >
        {#snippet icon()}
          <Clock3 class="size-6" />
        {/snippet}
      </StatCard>

      <StatCard
        title={t('analytics.birdMigration.stats.seasonDetections')}
        value={birdMigration.pageData
          ? formatBirdMigrationNumber(birdMigration.pageData.summary.detection_count)
          : 0}
        subtitle={birdMigration.selectedSeason.is_current
          ? t('analytics.birdMigration.season.observedThrough', {
              date: formatBirdMigrationDate(birdMigration.observedEndDate),
            })
          : formatBirdMigrationDate(birdMigration.selectedSeason.end_date)}
        isLoading={birdMigration.isLoading}
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
          <p>
            {t('analytics.birdMigration.tables.explainerRecent', {
              days: birdMigration.windowDays,
            })}
          </p>
          <p>
            {t('analytics.birdMigration.tables.explainerQuiet', { days: birdMigration.windowDays })}
          </p>
          <p>
            {t('analytics.birdMigration.tables.explainerDisappearances', {
              days: birdMigration.windowDays,
            })}
          </p>
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

          {#if !birdMigration.isLoading && birdMigration.pageData && birdMigration.pageData.arrival_timeline.length > 0}
            <div class="mt-4 h-80">
              <BirdMigrationArrivalChart data={birdMigration.pageData.arrival_timeline} />
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

          {#if !birdMigration.isLoading && birdMigration.pageData && birdMigration.pageData.activity_timeline.length > 0}
            <div class="mt-4 h-80">
              <BirdMigrationActivityChart data={birdMigration.pageData.activity_timeline} />
            </div>
          {:else}
            <div class="py-8 text-center text-sm text-[var(--color-base-content)] opacity-60">
              {t('analytics.charts.noDataAvailable')}
            </div>
          {/if}
        </div>
      </div>
    </div>

    {#if birdMigration.pageData}
      <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <BirdMigrationSpeciesTableSection
          variant="recent-arrivals"
          rows={birdMigration.pageData.recent_arrivals}
          onSpeciesClick={birdMigration.openDetections}
        />

        <BirdMigrationSpeciesTableSection
          variant="quiet-species"
          rows={birdMigration.pageData.quiet_species}
          onSpeciesClick={birdMigration.openDetections}
        />
      </div>

      <BirdMigrationDisappearancesSection
        rows={birdMigration.pageData.disappearances}
        onSpeciesClick={scientificName => birdMigration.openDetections(scientificName, 'date_asc')}
      />

      <BirdMigrationSpeciesTableSection
        variant="roster"
        rows={birdMigration.pageData.roster}
        countLabel={formatBirdMigrationNumber(birdMigration.pageData.roster.length)}
        onSpeciesClick={birdMigration.openDetections}
      />
    {/if}
  {/if}
</div>
