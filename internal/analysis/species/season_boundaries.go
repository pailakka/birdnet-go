package species

import (
	"time"

	"github.com/tphakala/birdnet-go/internal/conf"
	"github.com/tphakala/birdnet-go/internal/errors"
)

// SeasonBoundary represents a season start date resolved from seasonal tracking settings.
type SeasonBoundary struct {
	Name  string
	Start time.Time
}

// ResolveSeasonBoundary resolves the current season name and start date for the given time.
func ResolveSeasonBoundary(
	currentTime time.Time,
	configuredSeasons map[string]conf.Season,
) (SeasonBoundary, error) {
	tracker, err := newSeasonBoundaryTracker(configuredSeasons)
	if err != nil {
		return SeasonBoundary{}, err
	}

	seasonName := tracker.computeCurrentSeason(currentTime)
	seasonStart, exists := tracker.seasons[seasonName]
	if !exists {
		return SeasonBoundary{}, errors.Newf("season %q not found in configuration", seasonName).
			Component("species-tracking").
			Category(errors.CategoryValidation).
			Build()
	}

	return SeasonBoundary{
		Name:  seasonName,
		Start: tracker.calculateSeasonStartDate(seasonName, seasonStart, currentTime),
	}, nil
}

// NextSeasonBoundary resolves the next season start after the provided season start.
func NextSeasonBoundary(
	currentStart time.Time,
	configuredSeasons map[string]conf.Season,
) (SeasonBoundary, error) {
	tracker, err := newSeasonBoundaryTracker(configuredSeasons)
	if err != nil {
		return SeasonBoundary{}, err
	}

	nextSeason := SeasonBoundary{}
	for name, season := range tracker.seasons {
		for _, year := range []int{currentStart.Year(), currentStart.Year() + 1} {
			candidate := time.Date(
				year,
				time.Month(season.month),
				season.day,
				0,
				0,
				0,
				0,
				currentStart.Location(),
			)
			if !candidate.After(currentStart) {
				continue
			}
			if nextSeason.Start.IsZero() || candidate.Before(nextSeason.Start) {
				nextSeason = SeasonBoundary{
					Name:  name,
					Start: candidate,
				}
			}
		}
	}

	if nextSeason.Start.IsZero() {
		return SeasonBoundary{}, errors.Newf("next season boundary could not be resolved").
			Component("species-tracking").
			Category(errors.CategoryValidation).
			Build()
	}

	return nextSeason, nil
}

func newSeasonBoundaryTracker(
	configuredSeasons map[string]conf.Season,
) (*SpeciesTracker, error) {
	if len(configuredSeasons) == 0 {
		return nil, errors.Newf("no seasons configured").
			Component("species-tracking").
			Category(errors.CategoryValidation).
			Build()
	}

	tracker := &SpeciesTracker{
		seasons:         make(map[string]seasonDates, len(configuredSeasons)),
		seasonalEnabled: true,
	}

	for name, season := range configuredSeasons {
		if err := validateSeasonDate(season.StartMonth, season.StartDay); err != nil {
			return nil, err
		}
		tracker.seasons[name] = seasonDates{
			month: season.StartMonth,
			day:   season.StartDay,
		}
	}

	tracker.initializeSeasonOrder()
	return tracker, nil
}
