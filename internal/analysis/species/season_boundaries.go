package species

import (
	"cmp"
	"maps"
	"slices"
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
	seasons, err := configuredSeasonDates(configuredSeasons)
	if err != nil {
		return SeasonBoundary{}, err
	}

	seasonName := computeCurrentSeasonName(seasons, buildSeasonOrder(seasons), currentTime)
	seasonStart, exists := seasons[seasonName]
	if !exists {
		return SeasonBoundary{}, errors.Newf("season %q not found in configuration", seasonName).
			Component("species-tracking").
			Category(errors.CategoryValidation).
			Build()
	}

	return SeasonBoundary{
		Name:  seasonName,
		Start: calculateSeasonStartDateFor(seasons, seasonStart, currentTime, false),
	}, nil
}

// NextSeasonBoundary resolves the next season start after the provided season start.
func NextSeasonBoundary(
	currentStart time.Time,
	configuredSeasons map[string]conf.Season,
) (SeasonBoundary, error) {
	seasons, err := configuredSeasonDates(configuredSeasons)
	if err != nil {
		return SeasonBoundary{}, err
	}

	return nextSeasonBoundary(currentStart, seasons)
}

func configuredSeasonDates(configuredSeasons map[string]conf.Season) (map[string]seasonDates, error) {
	if len(configuredSeasons) == 0 {
		return nil, errors.Newf("no seasons configured").
			Component("species-tracking").
			Category(errors.CategoryValidation).
			Build()
	}

	seasons := make(map[string]seasonDates, len(configuredSeasons))
	for name, season := range configuredSeasons {
		mappedSeason, err := seasonDateFromConfig(season)
		if err != nil {
			return nil, err
		}
		seasons[name] = mappedSeason
	}

	return seasons, nil
}

func seasonDateFromConfig(season conf.Season) (seasonDates, error) {
	if err := validateSeasonDate(season.StartMonth, season.StartDay); err != nil {
		return seasonDates{}, err
	}

	return seasonDates{
		month: season.StartMonth,
		day:   season.StartDay,
	}, nil
}

func defaultSeasonDates() map[string]seasonDates {
	return map[string]seasonDates{
		"spring": {month: monthMarch, day: daySpringEquinox},
		"summer": {month: monthJune, day: daySummerSolstice},
		"fall":   {month: monthSeptember, day: dayFallEquinox},
		"winter": {month: monthDecember, day: dayWinterSolstice},
	}
}

func buildSeasonOrder(seasons map[string]seasonDates) []string {
	if hasAllSeasons(seasons, []string{"winter", "spring", "summer", "fall"}) {
		return []string{"winter", "spring", "summer", "fall"}
	}
	if hasAllSeasons(seasons, []string{"dry2", "wet1", "dry1", "wet2"}) {
		return []string{"dry2", "wet1", "dry1", "wet2"}
	}

	seasonOrder := slices.Collect(maps.Keys(seasons))
	slices.SortFunc(seasonOrder, func(left, right string) int {
		leftSeason := seasons[left]
		rightSeason := seasons[right]
		if leftSeason.month != rightSeason.month {
			return cmp.Compare(leftSeason.month, rightSeason.month)
		}
		if leftSeason.day != rightSeason.day {
			return cmp.Compare(leftSeason.day, rightSeason.day)
		}
		return cmp.Compare(left, right)
	})

	return seasonOrder
}

func hasAllSeasons(seasons map[string]seasonDates, required []string) bool {
	for _, name := range required {
		if _, exists := seasons[name]; !exists {
			return false
		}
	}
	return true
}

func nextSeasonBoundary(currentStart time.Time, seasons map[string]seasonDates) (SeasonBoundary, error) {
	nextSeason := SeasonBoundary{}
	for name, season := range seasons {
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

func isInEarlyWinterMonthsFor(seasons map[string]seasonDates, currentMonth time.Month) bool {
	winterSeason, hasWinter := seasons["winter"]
	if !hasWinter {
		return false
	}

	winterStartMonth := time.Month(winterSeason.month)
	earlyWinterMonth1 := (winterStartMonth % monthsPerYear) + 1
	earlyWinterMonth2 := ((winterStartMonth + 1) % monthsPerYear) + 1
	return currentMonth == earlyWinterMonth1 || currentMonth == earlyWinterMonth2
}

func shouldAdjustFallSeasonYearFor(
	seasons map[string]seasonDates,
	now time.Time,
	seasonMonth time.Month,
) bool {
	fallSeason, hasFall := seasons["fall"]
	if !hasFall || int(seasonMonth) != fallSeason.month {
		return false
	}

	return isInEarlyWinterMonthsFor(seasons, now.Month())
}

func shouldAdjustYearForSeasonFor(
	seasons map[string]seasonDates,
	now time.Time,
	seasonMonth time.Month,
	isRangeCalculation bool,
) bool {
	if seasonMonth >= time.October && now.Month() < yearCrossingCutoffMonth {
		return true
	}
	if isRangeCalculation && shouldAdjustFallSeasonYearFor(seasons, now, seasonMonth) {
		return true
	}

	return false
}

func calculateSeasonStartDateFor(
	seasons map[string]seasonDates,
	seasonStart seasonDates,
	currentTime time.Time,
	isRangeCalculation bool,
) time.Time {
	seasonDate := time.Date(
		currentTime.Year(),
		time.Month(seasonStart.month),
		seasonStart.day,
		0,
		0,
		0,
		0,
		currentTime.Location(),
	)

	if shouldAdjustYearForSeasonFor(
		seasons,
		currentTime,
		time.Month(seasonStart.month),
		isRangeCalculation,
	) {
		seasonDate = time.Date(
			currentTime.Year()-1,
			time.Month(seasonStart.month),
			seasonStart.day,
			0,
			0,
			0,
			0,
			currentTime.Location(),
		)
	}

	return seasonDate
}

func computeCurrentSeasonName(
	seasons map[string]seasonDates,
	seasonOrder []string,
	currentTime time.Time,
) string {
	var currentSeason string
	var latestDate time.Time

	for _, seasonName := range seasonOrder {
		seasonStart, exists := seasons[seasonName]
		if !exists {
			continue
		}

		seasonDate := calculateSeasonStartDateFor(seasons, seasonStart, currentTime, false)
		isOnOrAfter := !currentTime.Before(seasonDate)
		isMoreRecent := currentSeason == "" || seasonDate.After(latestDate)
		if isOnOrAfter && isMoreRecent {
			currentSeason = seasonName
			latestDate = seasonDate
		}
	}

	if currentSeason != "" {
		return currentSeason
	}
	if _, hasWinter := seasons["winter"]; hasWinter {
		return "winter"
	}
	if len(seasonOrder) > 0 {
		return seasonOrder[len(seasonOrder)-1]
	}

	return ""
}
