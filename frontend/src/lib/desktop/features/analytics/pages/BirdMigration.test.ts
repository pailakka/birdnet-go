import { render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import BirdMigration from './BirdMigration.svelte';

const { appStateMock } = vi.hoisted(() => ({
  appStateMock: {
    seasonalTracking: {
      enabled: false,
      windowDays: 0,
      seasons: {},
    },
  },
}));

vi.mock('$lib/i18n', () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock('$lib/stores/appState.svelte', () => ({
  appState: appStateMock,
}));

vi.mock('$lib/stores/navigation.svelte', () => ({
  navigation: {
    navigate: vi.fn(),
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

describe('BirdMigration page', () => {
  beforeEach(() => {
    appStateMock.seasonalTracking.enabled = false;
    appStateMock.seasonalTracking.windowDays = 0;
    appStateMock.seasonalTracking.seasons = {};
    window.history.replaceState({}, '', '/ui/analytics/bird-migration');
  });

  it('shows the unsupported empty state when seasonal tracking is disabled', () => {
    render(BirdMigration);

    expect(screen.getByText('analytics.birdMigration.states.disabledTitle')).toBeInTheDocument();
    expect(
      screen.getByText('analytics.birdMigration.states.disabledDescription')
    ).toBeInTheDocument();
  });
});
