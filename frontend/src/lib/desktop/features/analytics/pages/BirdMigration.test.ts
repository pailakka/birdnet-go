import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getLocalDateString } from '$lib/utils/date';

import BirdMigration from './BirdMigration.svelte';

const { navigateMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
}));

vi.mock('$lib/i18n', () => ({
  t: vi.fn((key: string) => {
    const translations = new Map<string, string>([
      ['settings.species.tracking.seasonal.seasons.spring', 'Spring'],
      ['analytics.birdMigration.states.disabledTitle', 'Bird migration unavailable'],
      [
        'analytics.birdMigration.states.disabledDescription',
        'Seasonal tracking is disabled or has no configured seasons.',
      ],
      ['analytics.birdMigration.controls.currentSeason', 'Current Season'],
      ['analytics.birdMigration.tables.disappearances', 'Disappearances'],
    ]);

    return translations.get(key) ?? key;
  }),
}));

vi.mock('$lib/stores/navigation.svelte', () => ({
  navigation: {
    navigate: navigateMock,
  },
}));

vi.mock('$lib/utils/logger', () => ({
  loggers: {
    analytics: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  },
}));

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}

describe('BirdMigration page', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    navigateMock.mockReset();
    window.history.replaceState({}, '', '/ui/analytics/bird-migration');
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('shows the unsupported empty state when seasonal tracking is disabled', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        enabled: false,
        window_days: 0,
        current_season_start: '',
        seasons: [],
      })
    ) as typeof global.fetch;

    render(BirdMigration);

    expect(await screen.findByText('Bird migration unavailable')).toBeInTheDocument();
    expect(
      screen.getByText('Seasonal tracking is disabled or has no configured seasons.')
    ).toBeInTheDocument();
  });

  it('loads seasons, shows season controls, and opens detections with a season range', async () => {
    const expectedEndDate = getLocalDateString();

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          enabled: true,
          window_days: 7,
          current_season_start: '2026-03-01',
          seasons: [
            {
              name: 'spring',
              start_date: '2026-03-01',
              end_date: '2026-05-31',
              is_current: true,
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse([
          {
            common_name: 'Whooper Swan',
            scientific_name: 'Cygnus cygnus',
            species_code: 'whoswa',
            count: 8,
            active_days: 3,
            first_heard: '2026-03-18 07:10:00',
            last_heard: '2026-03-21 08:20:00',
            avg_confidence: 0.92,
            max_confidence: 0.97,
          },
          {
            common_name: 'European Robin',
            scientific_name: 'Erithacus rubecula',
            species_code: 'eurrob',
            count: 11,
            active_days: 5,
            first_heard: '2026-03-01 05:45:00',
            last_heard: '2026-03-20 06:00:00',
            avg_confidence: 0.89,
            max_confidence: 0.95,
          },
        ])
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            { date: '2026-03-18', count: 4 },
            { date: '2026-03-19', count: 7 },
            { date: '2026-03-20', count: 5 },
            { date: '2026-03-21', count: 8 },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            { date: '2026-03-18', unique_species: 1 },
            { date: '2026-03-19', unique_species: 1 },
            { date: '2026-03-20', unique_species: 2 },
            { date: '2026-03-21', unique_species: 2 },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              common_name: 'European Robin',
              scientific_name: 'Erithacus rubecula',
              species_code: 'eurrob',
              last_heard_before_gap: '2026-03-05',
              returned_on: '2026-03-18',
              gap_days: 13,
            },
          ],
        })
      )
      .mockResolvedValueOnce(jsonResponse({})) as typeof global.fetch;

    render(BirdMigration);

    expect((await screen.findAllByText('Spring 2026')).length).toBeGreaterThan(0);
    expect(screen.getByText('Current Season')).toBeInTheDocument();
    expect(await screen.findByText('Disappearances')).toBeInTheDocument();

    const swanButtons = await screen.findAllByRole('button', { name: /Whooper Swan/i });
    await fireEvent.click(swanButtons[0]);

    expect(navigateMock).toHaveBeenCalledWith(
      `/ui/detections?queryType=species&species=Cygnus+cygnus&start_date=2026-03-01&end_date=${expectedEndDate}&sortBy=date_asc&numResults=100&offset=0`
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/v2/analytics/bird-migration/seasons');
    });
  });
});
