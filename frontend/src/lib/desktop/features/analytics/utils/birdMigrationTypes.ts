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

export interface BirdMigrationSpeciesSummary {
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
}

export interface BirdMigrationSpeciesRecord extends BirdMigrationSpeciesSummary {
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

export interface BirdMigrationDailyDetections {
  date: string;
  count: number;
}

export interface BirdMigrationDailyDiversity {
  date: string;
  unique_species: number;
}

export interface BirdMigrationArrivalDatum {
  date: string;
  newSpeciesCount: number;
  cumulativeSpeciesCount: number;
}

export interface BirdMigrationActivityDatum {
  date: string;
  detectionCount: number;
  activeSpeciesCount: number;
}

export interface BirdMigrationSummaryStats {
  speciesCount: number;
  detectionCount: number;
  recentArrivalsCount: number;
  quietSpeciesCount: number;
}

export interface BirdMigrationDerivedData {
  summary: BirdMigrationSummaryStats;
  roster: BirdMigrationSpeciesRecord[];
  recentArrivals: BirdMigrationSpeciesRecord[];
  quietSpecies: BirdMigrationSpeciesRecord[];
  disappearances: BirdMigrationDisappearanceRecord[];
  arrivalTimeline: BirdMigrationArrivalDatum[];
  activityTimeline: BirdMigrationActivityDatum[];
}
