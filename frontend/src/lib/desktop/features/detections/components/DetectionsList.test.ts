import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import DetectionsList from './DetectionsList.svelte';

vi.mock('$lib/i18n', () => ({
  t: vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  ),
}));

describe('DetectionsList titles', () => {
  it('renders a range-aware species title when start and end dates are present', () => {
    render(DetectionsList, {
      props: {
        data: {
          notes: [],
          queryType: 'species',
          date: '2026-03-01',
          startDate: '2026-03-01',
          endDate: '2026-03-21',
          species: 'Cygnus cygnus',
          numResults: 25,
          offset: 0,
          totalResults: 0,
          itemsPerPage: 25,
          currentPage: 1,
          totalPages: 1,
          showingFrom: 0,
          showingTo: 0,
        },
      },
    });

    expect(
      screen.getByText(
        'detections.titles.speciesDateRange:{"species":"Cygnus cygnus","startDate":"2026-03-01","endDate":"2026-03-21"}'
      )
    ).toBeInTheDocument();
  });
});
