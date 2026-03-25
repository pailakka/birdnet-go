<script lang="ts">
  import EmptyState from '$lib/desktop/components/ui/EmptyState.svelte';
  import { handleBirdImageError } from '$lib/desktop/components/ui/image-utils';
  import { t } from '$lib/i18n';
  import {
    formatBirdMigrationDate,
    formatBirdMigrationDateTime,
    formatBirdMigrationNumber,
    getBirdMigrationSpeciesInitials,
  } from '../../utils/birdMigrationDisplay';
  import type {
    BirdMigrationDetectionsSortBy,
    BirdMigrationSpeciesRecord,
  } from '../../utils/birdMigrationTypes';

  type Variant = 'recent-arrivals' | 'quiet-species' | 'roster';
  type VariantConfig = {
    accentClasses: string;
    description: string;
    emptyDescription: string;
    sortBy: BirdMigrationDetectionsSortBy;
    title: string;
  };

  interface Props {
    variant: Variant;
    rows: BirdMigrationSpeciesRecord[];
    countLabel?: string;
    onSpeciesClick: (_scientificName: string, _sortBy: BirdMigrationDetectionsSortBy) => void;
  }

  let { variant, rows, countLabel, onSpeciesClick }: Props = $props();

  const config = $derived.by<VariantConfig>(() => {
    if (variant === 'recent-arrivals') {
      return {
        accentClasses: 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]',
        description: t('analytics.birdMigration.tables.recentArrivalsDescription'),
        emptyDescription: t('analytics.birdMigration.tables.noRecentArrivals'),
        sortBy: 'date_asc',
        title: t('analytics.birdMigration.tables.recentArrivals'),
      };
    }

    if (variant === 'quiet-species') {
      return {
        accentClasses: 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]',
        description: t('analytics.birdMigration.tables.quietSpeciesDescription'),
        emptyDescription: t('analytics.birdMigration.tables.noQuietSpecies'),
        sortBy: 'date_desc',
        title: t('analytics.birdMigration.tables.quietSpecies'),
      };
    }

    return {
      accentClasses: 'bg-[var(--color-secondary)]/10 text-[var(--color-secondary)]',
      description: t('analytics.birdMigration.tables.rosterDescription'),
      emptyDescription: t('analytics.birdMigration.tables.noSeasonDetections'),
      sortBy: 'date_desc',
      title: t('analytics.birdMigration.tables.roster'),
    };
  });

  const displayCount = $derived(countLabel ?? formatBirdMigrationNumber(rows.length));
</script>

<div class="card bg-[var(--color-base-100)] shadow-xs">
  <div class="card-body p-4 md:p-6">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h2 class="card-title">{config.title}</h2>
        <p class="text-sm text-[var(--color-base-content)] opacity-70">
          {config.description}
        </p>
      </div>
      <span class="text-sm text-[var(--color-base-content)] opacity-70">
        {displayCount}
      </span>
    </div>

    {#if rows.length === 0}
      <EmptyState
        title={t('analytics.birdMigration.tables.emptyTitle')}
        description={config.emptyDescription}
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
                    onclick={() => onSpeciesClick(species.scientific_name, config.sortBy)}
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
                        class={`size-10 rounded-lg flex items-center justify-center text-xs font-semibold ${config.accentClasses}`}
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
