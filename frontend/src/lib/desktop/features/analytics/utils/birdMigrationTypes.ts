export interface BirdMigrationSeason {
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

export interface BirdMigrationDisplaySeason extends BirdMigrationSeason {
  label: string;
}

export type BirdMigrationDetectionsSortBy = 'date_asc' | 'date_desc';

export interface BirdMigrationSpeciesRecord {
  common_name: string;
  scientific_name: string;
  species_code?: string;
  count: number;
  active_days: number;
  first_heard: string;
  last_heard: string;
  avg_confidence: number;
  max_confidence: number;
  thumbnail_url?: string;
  first_heard_date: string;
  last_heard_date: string;
  days_since_first_seen: number;
  days_since_last_seen: number;
}

export interface BirdMigrationDisappearanceRecord {
  common_name: string;
  scientific_name: string;
  species_code?: string;
  last_heard_before_gap: string;
  returned_on: string;
  gap_days: number;
  thumbnail_url?: string;
}

export interface BirdMigrationArrivalDatum {
  date: string;
  new_species_count: number;
  cumulative_species_count: number;
}

export interface BirdMigrationActivityDatum {
  date: string;
  detection_count: number;
  active_species_count: number;
}

export interface BirdMigrationSummary {
  species_count: number;
  detection_count: number;
  recent_arrivals_count: number;
  quiet_species_count: number;
}

export interface BirdMigrationPageResponse {
  enabled: boolean;
  window_days: number;
  seasons: BirdMigrationSeason[];
  selected_season_start?: string;
  selected_season?: BirdMigrationSeason;
  observed_end_date?: string;
  summary: BirdMigrationSummary;
  roster: BirdMigrationSpeciesRecord[];
  recent_arrivals: BirdMigrationSpeciesRecord[];
  quiet_species: BirdMigrationSpeciesRecord[];
  disappearances: BirdMigrationDisappearanceRecord[];
  arrival_timeline: BirdMigrationArrivalDatum[];
  activity_timeline: BirdMigrationActivityDatum[];
}
