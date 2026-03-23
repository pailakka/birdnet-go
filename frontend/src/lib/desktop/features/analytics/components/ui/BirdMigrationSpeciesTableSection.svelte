<script lang="ts">
  import EmptyState from '$lib/desktop/components/ui/EmptyState.svelte';
  import { handleBirdImageError } from '$lib/desktop/components/ui/image-utils';
  import { t } from '$lib/i18n';
  import {
    formatBirdMigrationDate,
    formatBirdMigrationDateTime,
    formatBirdMigrationNumber,
    getBirdMigrationSpeciesInitials,
    type BirdMigrationDetectionsSortBy,
    type BirdMigrationSpeciesRecord,
  } from '../../utils/birdMigration';

  type Variant = 'recent-arrivals' | 'quiet-species' | 'roster';

  interface Props {
    variant: Variant;
    rows: BirdMigrationSpeciesRecord[];
    countLabel?: string;
    onSpeciesClick: (_scientificName: string, _sortBy: BirdMigrationDetectionsSortBy) => void;
  }

  let { variant, rows, countLabel, onSpeciesClick }: Props = $props();

  function getAccentClasses(currentVariant: Variant): string {
    switch (currentVariant) {
      case 'recent-arrivals':
        return 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]';
      case 'quiet-species':
        return 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]';
      case 'roster':
        return 'bg-[var(--color-secondary)]/10 text-[var(--color-secondary)]';
    }

    return '';
  }

  function getSortBy(currentVariant: Variant): BirdMigrationDetectionsSortBy {
    return currentVariant === 'recent-arrivals' ? 'date_asc' : 'date_desc';
  }

  function getTitle(currentVariant: Variant): string {
    switch (currentVariant) {
      case 'recent-arrivals':
        return t('analytics.birdMigration.tables.recentArrivals');
      case 'quiet-species':
        return t('analytics.birdMigration.tables.quietSpecies');
      case 'roster':
        return t('analytics.birdMigration.tables.roster');
    }

    return '';
  }

  function getDescription(currentVariant: Variant): string {
    switch (currentVariant) {
      case 'recent-arrivals':
        return t('analytics.birdMigration.tables.recentArrivalsDescription');
      case 'quiet-species':
        return t('analytics.birdMigration.tables.quietSpeciesDescription');
      case 'roster':
        return t('analytics.birdMigration.tables.rosterDescription');
    }

    return '';
  }

  function getEmptyDescription(currentVariant: Variant): string {
    switch (currentVariant) {
      case 'recent-arrivals':
        return t('analytics.birdMigration.tables.noRecentArrivals');
      case 'quiet-species':
        return t('analytics.birdMigration.tables.noQuietSpecies');
      case 'roster':
        return t('analytics.birdMigration.tables.noSeasonDetections');
    }

    return '';
  }

  const displayCount = $derived(countLabel ?? formatBirdMigrationNumber(rows.length));
</script>

<div class="card bg-[var(--color-base-100)] shadow-xs">
  <div class="card-body p-4 md:p-6">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h2 class="card-title">{getTitle(variant)}</h2>
        <p class="text-sm text-[var(--color-base-content)] opacity-70">
          {getDescription(variant)}
        </p>
      </div>
      <span class="text-sm text-[var(--color-base-content)] opacity-70">
        {displayCount}
      </span>
    </div>

    {#if rows.length === 0}
      <EmptyState
        title={t('analytics.birdMigration.tables.emptyTitle')}
        description={getEmptyDescription(variant)}
        className={variant === 'roster' ? 'py-10' : 'py-8'}
      />
    {:else}
      <div class="overflow-x-auto">
        <table class="table table-sm mt-4">
          <thead>
            <tr>
              <th>{t('analytics.birdMigration.tables.columns.species')}</th>
              {#if variant !== 'quiet-species'}
                <th>{t('analytics.birdMigration.tables.columns.firstHeard')}</th>
              {/if}
              {#if variant !== 'recent-arrivals'}
                <th>{t('analytics.birdMigration.tables.columns.lastHeard')}</th>
              {/if}
              {#if variant === 'quiet-species'}
                <th>{t('analytics.birdMigration.tables.columns.daysQuiet')}</th>
              {/if}
              <th>{t('analytics.birdMigration.tables.columns.activeDays')}</th>
              {#if variant !== 'quiet-species'}
                <th>{t('analytics.birdMigration.tables.columns.detections')}</th>
              {/if}
            </tr>
          </thead>
          <tbody>
            {#each rows as species}
              <tr class="hover">
                <td>
                  <button
                    type="button"
                    class="flex items-center gap-3 text-left"
                    onclick={() => onSpeciesClick(species.scientific_name, getSortBy(variant))}
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
                        class={`size-10 rounded-lg flex items-center justify-center text-xs font-semibold ${getAccentClasses(variant)}`}
                      >
                        {getBirdMigrationSpeciesInitials(species.common_name)}
                      </div>
                    {/if}
                    <span>
                      <span class="block font-medium">{species.common_name}</span>
                      <span class="block text-xs opacity-60 italic">{species.scientific_name}</span>
                    </span>
                  </button>
                </td>
                {#if variant !== 'quiet-species'}
                  <td title={formatBirdMigrationDateTime(species.first_heard)}>
                    {formatBirdMigrationDate(species.first_heard_date)}
                  </td>
                {/if}
                {#if variant !== 'recent-arrivals'}
                  <td title={formatBirdMigrationDateTime(species.last_heard)}>
                    {formatBirdMigrationDate(species.last_heard_date)}
                  </td>
                {/if}
                {#if variant === 'quiet-species'}
                  <td>{formatBirdMigrationNumber(species.days_since_last_seen)}</td>
                {/if}
                <td>{formatBirdMigrationNumber(species.active_days)}</td>
                {#if variant !== 'quiet-species'}
                  <td>{formatBirdMigrationNumber(species.count)}</td>
                {/if}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>
