<script lang="ts">
  import EmptyState from '$lib/desktop/components/ui/EmptyState.svelte';
  import { handleBirdImageError } from '$lib/desktop/components/ui/image-utils';
  import { t } from '$lib/i18n';
  import {
    formatBirdMigrationDate,
    formatBirdMigrationNumber,
    getBirdMigrationSpeciesInitials,
  } from '../../utils/birdMigrationDisplay';
  import type { BirdMigrationDisappearanceRecord } from '../../utils/birdMigrationTypes';

  interface Props {
    rows: BirdMigrationDisappearanceRecord[];
    onSpeciesClick: (_scientificName: string) => void;
  }

  let { rows, onSpeciesClick }: Props = $props();
</script>

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
        {formatBirdMigrationNumber(rows.length)}
      </span>
    </div>

    {#if rows.length === 0}
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
            {#each rows as species}
              <tr class="hover">
                <td>
                  <button
                    type="button"
                    class="flex items-center gap-3 text-left"
                    onclick={() => onSpeciesClick(species.scientific_name)}
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
                        {getBirdMigrationSpeciesInitials(species.common_name)}
                      </div>
                    {/if}
                    <span>
                      <span class="block font-medium">{species.common_name}</span>
                      <span class="block text-xs opacity-60 italic">{species.scientific_name}</span>
                    </span>
                  </button>
                </td>
                <td>{formatBirdMigrationDate(species.last_heard_before_gap)}</td>
                <td>{formatBirdMigrationDate(species.returned_on)}</td>
                <td>{formatBirdMigrationNumber(species.gap_days)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>
