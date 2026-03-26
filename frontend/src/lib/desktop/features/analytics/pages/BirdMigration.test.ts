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
      ['settings.species.tracking.seasonal.seasons.winter', 'Winter'],
      ['analytics.birdMigration.states.disabledTitle', 'Bird migration unavailable'],
      [
        'analytics.birdMigration.states.disabledDescription',
        'Seasonal tracking is disabled or has no configured seasons.',
      ],
      ['analytics.birdMigration.controls.currentSeason', 'Current Season'],
      ['analytics.birdMigration.controls.previousSeason', 'Previous Season'],
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

function buildPageResponse(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    window_days: 7,
    seasons: [
      {
        name: 'winter',
        start_date: '2025-12-21',
        end_date: '2026-02-28',
        is_current: false,
      },
      {
        name: 'spring',
        start_date: '2026-03-01',
        end_date: '2026-05-31',
        is_current: true,
      },
    ],
    selected_season_start: '2026-03-01',
    selected_season: {
      name: 'spring',
      start_date: '2026-03-01',
      end_date: '2026-05-31',
      is_current: true,
    },
    observed_end_date: getLocalDateString(),
    summary: {
      species_count: 2,
      detection_count: 19,
      recent_arrivals_count: 1,
      quiet_species_count: 0,
    },
    roster: [
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
        first_heard_date: '2026-03-01',
        last_heard_date: '2026-03-20',
        days_since_first_seen: 20,
        days_since_last_seen: 1,
      },
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
        first_heard_date: '2026-03-18',
        last_heard_date: '2026-03-21',
        days_since_first_seen: 3,
        days_since_last_seen: 0,
      },
    ],
    recent_arrivals: [
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
        first_heard_date: '2026-03-18',
        last_heard_date: '2026-03-21',
        days_since_first_seen: 3,
        days_since_last_seen: 0,
      },
    ],
    quiet_species: [],
    disappearances: [
      {
        common_name: 'European Robin',
        scientific_name: 'Erithacus rubecula',
        species_code: 'eurrob',
        last_heard_before_gap: '2026-03-05',
        returned_on: '2026-03-18',
        gap_days: 13,
      },
    ],
    arrival_timeline: [
      {
        date: '2026-03-18',
        new_species_count: 1,
        cumulative_species_count: 2,
      },
      {
        date: getLocalDateString(),
        new_species_count: 0,
        cumulative_species_count: 2,
      },
    ],
    activity_timeline: [
      {
        date: '2026-03-18',
        detection_count: 4,
        active_species_count: 1,
      },
      {
        date: getLocalDateString(),
        detection_count: 8,
        active_species_count: 2,
      },
    ],
    ...overrides,
  };
}

describe('BirdMigration page', () => {
  const originalFetch = global.fetch;
  const buildTestUrl = (path: string) => new URL(path, window.location.href).toString();

  beforeEach(() => {
    navigateMock.mockReset();
    window.history.replaceState({}, '', buildTestUrl('/ui/analytics/bird-migration'));
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('shows the unsupported empty state when seasonal tracking is disabled', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        enabled: false,
        window_days: 0,
        seasons: [],
        summary: {
          species_count: 0,
          detection_count: 0,
          recent_arrivals_count: 0,
          quiet_species_count: 0,
        },
        roster: [],
        recent_arrivals: [],
        quiet_species: [],
        disappearances: [],
        arrival_timeline: [],
        activity_timeline: [],
      })
    ) as typeof global.fetch;

    render(BirdMigration);

    expect(await screen.findByText('Bird migration unavailable')).toBeInTheDocument();
    expect(
      screen.getByText('Seasonal tracking is disabled or has no configured seasons.')
    ).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith('/api/v2/analytics/bird-migration/page', {
      signal: expect.any(AbortSignal),
    });
  });

  it('loads the page payload, normalizes the URL, and opens detections with the season range', async () => {
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(buildPageResponse())) as typeof global.fetch;

    render(BirdMigration);

    expect((await screen.findAllByText('Spring 2026')).length).toBeGreaterThan(0);
    expect(screen.getByText('Current Season')).toBeInTheDocument();
    expect(await screen.findByText('Disappearances')).toBeInTheDocument();

    await waitFor(() => {
      expect(replaceStateSpy).toHaveBeenCalledWith(
        {},
        '',
        expect.stringContaining('?season_start=2026-03-01')
      );
    });

    const swanButtons = await screen.findAllByRole('button', { name: /Whooper Swan/i });
    await fireEvent.click(swanButtons[0]);

    expect(navigateMock).toHaveBeenCalledWith(
      `/ui/detections?queryType=species&species=Cygnus+cygnus&start_date=2026-03-01&end_date=${getLocalDateString()}&sortBy=date_asc&numResults=100&offset=0`
    );

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith('/api/v2/analytics/bird-migration/page', {
      signal: expect.any(AbortSignal),
    });

    replaceStateSpy.mockRestore();
  });

  it('loads one page payload per selected season and replaces the rendered season data', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(buildPageResponse()))
      .mockResolvedValueOnce(
        jsonResponse(
          buildPageResponse({
            selected_season_start: '2025-12-21',
            selected_season: {
              name: 'winter',
              start_date: '2025-12-21',
              end_date: '2026-02-28',
              is_current: false,
            },
            observed_end_date: '2026-02-28',
            summary: {
              species_count: 1,
              detection_count: 6,
              recent_arrivals_count: 0,
              quiet_species_count: 0,
            },
            roster: [
              {
                common_name: 'Bohemian Waxwing',
                scientific_name: 'Bombycilla garrulus',
                species_code: 'bohwax',
                count: 6,
                active_days: 3,
                first_heard: '2025-12-21 08:00:00',
                last_heard: '2026-02-15 09:00:00',
                avg_confidence: 0.91,
                max_confidence: 0.96,
                first_heard_date: '2025-12-21',
                last_heard_date: '2026-02-15',
                days_since_first_seen: 69,
                days_since_last_seen: 13,
              },
            ],
            recent_arrivals: [],
            quiet_species: [
              {
                common_name: 'Bohemian Waxwing',
                scientific_name: 'Bombycilla garrulus',
                species_code: 'bohwax',
                count: 6,
                active_days: 3,
                first_heard: '2025-12-21 08:00:00',
                last_heard: '2026-02-15 09:00:00',
                avg_confidence: 0.91,
                max_confidence: 0.96,
                first_heard_date: '2025-12-21',
                last_heard_date: '2026-02-15',
                days_since_first_seen: 69,
                days_since_last_seen: 13,
              },
            ],
            disappearances: [],
            arrival_timeline: [
              {
                date: '2025-12-21',
                new_species_count: 1,
                cumulative_species_count: 1,
              },
            ],
            activity_timeline: [
              {
                date: '2026-02-15',
                detection_count: 6,
                active_species_count: 1,
              },
            ],
          })
        )
      ) as typeof global.fetch;

    render(BirdMigration);

    expect((await screen.findAllByText('Whooper Swan')).length).toBeGreaterThan(0);

    const previousSeasonButton = await screen.findByRole('button', { name: 'Previous Season' });
    await fireEvent.click(previousSeasonButton);

    expect((await screen.findAllByText('Bohemian Waxwing')).length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Whooper Swan')).toHaveLength(0);

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenNthCalledWith(1, '/api/v2/analytics/bird-migration/page', {
      signal: expect.any(AbortSignal),
    });
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      '/api/v2/analytics/bird-migration/page?season_start=2025-12-21',
      {
        signal: expect.any(AbortSignal),
      }
    );
  });
});
