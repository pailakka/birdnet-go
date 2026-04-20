import type { DetectionQueryParams } from '$lib/types/detection.types';
import { getLocalDateString } from '$lib/utils/date';

export function parseDetectionDateFilter(
  params: URLSearchParams
): Pick<DetectionQueryParams, 'date' | 'start_date' | 'end_date'> {
  const startDate = params.get('start_date') ?? undefined;
  const endDate = params.get('end_date') ?? undefined;

  return {
    date: params.get('date') ?? ((startDate ?? endDate) ? undefined : getLocalDateString()),
    start_date: startDate,
    end_date: endDate,
  };
}
