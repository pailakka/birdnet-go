// season.go - Season calculation and validation functions

package species

import (
	"maps"
	"time"

	"github.com/tphakala/birdnet-go/internal/errors"
	"github.com/tphakala/birdnet-go/internal/logger"
)

// initializeDefaultSeasons sets up the default Northern Hemisphere seasons
func (t *SpeciesTracker) initializeDefaultSeasons() {
	maps.Copy(t.seasons, defaultSeasonDates())
}

// initializeSeasonOrder builds the cached season order based on configured seasons
// This is called once at initialization to avoid rebuilding on every computeCurrentSeason() call
func (t *SpeciesTracker) initializeSeasonOrder() {
	t.cachedSeasonOrder = buildSeasonOrder(t.seasons)

	getLog().Debug("Initialized season order cache",
		logger.Any("order", t.cachedSeasonOrder),
		logger.Int("count", len(t.cachedSeasonOrder)))
}

// validateSeasonDate validates that a month/day combination is valid
func validateSeasonDate(month, day int) error {
	if month < 1 || month > 12 {
		return errors.Newf("invalid month: %d (must be 1-12)", month).
			Component("species-tracking").
			Category(errors.CategoryValidation).
			Build()
	}

	maxDays := daysInMonth[month-1]
	// Special case for February - accept 29 for leap years
	if month == monthFebruary {
		maxDays = 29 // Accept Feb 29 since seasons are year-agnostic
	}

	if day < 1 || day > maxDays {
		return errors.Newf("invalid day %d for month %d (must be 1-%d)", day, month, maxDays).
			Component("species-tracking").
			Category(errors.CategoryValidation).
			Build()
	}

	return nil
}

// isInEarlyWinterMonths checks if the current month is in the early winter period
// (the 2 months after winter starts). Returns false if winter season is not configured.
func (t *SpeciesTracker) isInEarlyWinterMonths(currentMonth time.Month) bool {
	return isInEarlyWinterMonthsFor(t.seasons, currentMonth)
}

// shouldAdjustFallSeasonYear determines if fall season year should be adjusted to previous year.
// Returns true if we're in early winter months (when fall has ended).
func (t *SpeciesTracker) shouldAdjustFallSeasonYear(now time.Time, seasonMonth time.Month) bool {
	return shouldAdjustFallSeasonYearFor(t.seasons, now, seasonMonth)
}

// shouldAdjustYearForSeason determines if a season's year should be adjusted backward
// based on the current time and the use case (detection vs range calculation).
//
// For year-crossing seasons (Oct-Dec), adjusts to previous year when in early months (Jan-May).
// For range calculations, also handles fall season (Sep) when queried during winter months.
//
// Parameters:
//   - now: The current time to base the adjustment on
//   - seasonMonth: The month when the season starts
//   - isRangeCalculation: true when calculating date ranges (e.g., getSeasonDateRange),
//     false when detecting current season (e.g., computeCurrentSeason)
func (t *SpeciesTracker) shouldAdjustYearForSeason(now time.Time, seasonMonth time.Month, isRangeCalculation bool) bool {
	return shouldAdjustYearForSeasonFor(t.seasons, now, seasonMonth, isRangeCalculation)
}

// getCurrentSeason determines which season we're currently in with intelligent caching
func (t *SpeciesTracker) getCurrentSeason(currentTime time.Time) string {
	// Check cache first - if valid entry exists and the input time is reasonably close to cached time
	if t.cachedSeason != "" &&
		t.isSameSeasonPeriod(currentTime, t.seasonCacheForTime) &&
		time.Since(t.seasonCacheTime) < t.seasonCacheTTL {
		// Cache hit - return cached season directly
		return t.cachedSeason
	}

	// Cache miss or expired - compute fresh season
	season := t.computeCurrentSeason(currentTime)

	// Cache the computed result for future requests
	t.cachedSeason = season
	t.seasonCacheTime = time.Now()     // Cache time is when we computed it
	t.seasonCacheForTime = currentTime // Input time for which we computed

	return season
}

// isSameSeasonPeriod checks if two times are likely in the same season period
// This helps avoid cache misses for times that are very close together
func (t *SpeciesTracker) isSameSeasonPeriod(time1, time2 time.Time) bool {
	// If times are in different years, they could be in different seasons
	if time1.Year() != time2.Year() {
		return false
	}

	// If times are within the same day, they're definitely in the same season
	if time1.YearDay() == time2.YearDay() {
		return true
	}

	// Check if any season boundary falls between the two times
	// If so, they might be in different seasons even if close together
	day1 := time1.YearDay()
	day2 := time2.YearDay()
	minDay := min(day1, day2)
	maxDay := max(day1, day2)

	for _, season := range t.seasons {
		boundaryDate := time.Date(time1.Year(), time.Month(season.month), season.day, 0, 0, 0, 0, time1.Location())
		boundaryDay := boundaryDate.YearDay()

		// If a season boundary falls between the two times (inclusive of boundary day),
		// they could be in different seasons
		if boundaryDay >= minDay && boundaryDay <= maxDay {
			return false
		}
	}

	// If no boundaries between times and within buffer, consider same period
	// (seasons typically last ~90 days, so seasonBufferDays is a safe buffer)
	timeDiff := time1.Sub(time2)
	if timeDiff < 0 {
		timeDiff = -timeDiff
	}
	return timeDiff <= seasonBufferDuration
}

// calculateSeasonStartDate calculates the start date for a season, adjusting for year boundaries.
func (t *SpeciesTracker) calculateSeasonStartDate(seasonStart seasonDates, currentTime time.Time) time.Time {
	return calculateSeasonStartDateFor(t.seasons, seasonStart, currentTime, false)
}

// computeCurrentSeason performs the actual season calculation
func (t *SpeciesTracker) computeCurrentSeason(currentTime time.Time) string {
	getLog().Debug("Computing current season",
		logger.String("input_time", currentTime.Format(time.DateTime)),
		logger.Int("current_month", int(currentTime.Month())),
		logger.Int("current_day", currentTime.Day()),
		logger.Int("current_year", currentTime.Year()))

	// Use cached season order for efficiency (built once at initialization)
	seasonOrder := t.cachedSeasonOrder
	if len(seasonOrder) == 0 {
		getLog().Warn("Season order cache was empty, rebuilding", logger.Any("seasons", t.seasons))
		t.initializeSeasonOrder()
		seasonOrder = t.cachedSeasonOrder
	}

	// Find the most recent season start date
	currentSeason := computeCurrentSeasonName(t.seasons, seasonOrder, currentTime)
	if currentSeason == "" {
		currentSeason = "winter"
		getLog().Debug("Defaulting to winter season - no match found")
	}

	seasonStartDate := ""
	if seasonStart, exists := t.seasons[currentSeason]; exists {
		seasonStartDate = t.calculateSeasonStartDate(seasonStart, currentTime).Format(time.DateOnly)
	}

	getLog().Debug("Computed season result",
		logger.String("season", currentSeason),
		logger.String("season_start_date", seasonStartDate))

	return currentSeason
}

// checkAndResetPeriods checks if we need to reset yearly or seasonal tracking
func (t *SpeciesTracker) checkAndResetPeriods(currentTime time.Time) {
	// Check for yearly reset
	if t.yearlyEnabled && t.shouldResetYear(currentTime) {
		oldYear := t.currentYear
		t.speciesThisYear = make(map[string]time.Time)
		t.currentYear = t.getTrackingYear(currentTime) // Use tracking year, not calendar year
		// Clear status cache when year resets to ensure fresh calculations
		t.statusCache = make(map[string]cachedSpeciesStatus)
		getLog().Debug("Reset yearly tracking",
			logger.Int("old_year", oldYear),
			logger.Int("new_year", t.currentYear),
			logger.String("check_time", currentTime.Format(time.DateTime)))
	}

	// Check for seasonal reset
	if t.seasonalEnabled {
		newSeason := t.getCurrentSeason(currentTime)
		if newSeason != t.currentSeason {
			t.currentSeason = newSeason
			// Initialize season map if it doesn't exist
			if t.speciesBySeason[newSeason] == nil {
				t.speciesBySeason[newSeason] = make(map[string]time.Time)
			}
		}
	}
}

// shouldResetYear determines if we should reset yearly tracking
func (t *SpeciesTracker) shouldResetYear(currentTime time.Time) bool {
	// If we've never reset before (currentYear is 0), we need to reset
	if t.currentYear == 0 {
		return true
	}

	currentCalendarYear := currentTime.Year()

	// Handle standard January 1st resets
	if t.resetMonth == 1 && t.resetDay == 1 {
		// Standard calendar year - reset if we're in a later year
		return currentCalendarYear > t.currentYear
	}

	// Handle custom reset dates
	resetDate := time.Date(currentCalendarYear, time.Month(t.resetMonth), t.resetDay, 0, 0, 0, 0, currentTime.Location())

	// If we're in a later calendar year, definitely reset
	if currentCalendarYear > t.currentYear {
		return true
	}

	// If we're in an earlier calendar year (shouldn't happen normally), don't reset
	if currentCalendarYear < t.currentYear {
		return false
	}

	// Same calendar year - reset only on the exact reset day
	// This handles the case where we reach the reset day but not necessarily at midnight
	if currentCalendarYear == t.currentYear &&
		currentTime.Month() == resetDate.Month() &&
		currentTime.Day() == resetDate.Day() {
		return true
	}

	return false
}

// getTrackingYear determines which tracking year a given time falls into
// This handles custom reset dates (e.g., tracking years starting July 1st)
func (t *SpeciesTracker) getTrackingYear(now time.Time) int {
	currentYear := now.Year()

	// If current time is before this year's reset date, we're still in the previous tracking year
	currentYearResetDate := time.Date(currentYear, time.Month(t.resetMonth), t.resetDay, 0, 0, 0, 0, now.Location())

	if now.Before(currentYearResetDate) {
		// We haven't reached this year's reset date yet, so we're still in the previous tracking year
		return currentYear - 1
	}
	// We've passed this year's reset date, so we're in the current tracking year
	return currentYear
}

// getYearDateRange calculates the start and end dates for yearly tracking
func (t *SpeciesTracker) getYearDateRange(now time.Time) (startDate, endDate string) {
	// Use t.currentYear if explicitly set for testing, otherwise use the provided time's year
	currentYear := now.Year()
	useOverride := t.currentYear != 0 && t.currentYear != time.Now().Year()

	if useOverride {
		// Only use t.currentYear if it was explicitly set for testing (different from real current year)
		currentYear = t.currentYear
	}

	// Determine the tracking year based on reset date
	var trackingYear int

	if useOverride {
		// When year is overridden for testing, use it directly as the tracking year
		trackingYear = currentYear
	} else {
		// Normal operation: determine based on reset date
		// If current time is before this year's reset date, we're still in the previous tracking year
		currentYearResetDate := time.Date(currentYear, time.Month(t.resetMonth), t.resetDay, 0, 0, 0, 0, now.Location())

		if now.Before(currentYearResetDate) {
			// We haven't reached this year's reset date yet, so we're still in the previous tracking year
			trackingYear = currentYear - 1
		} else {
			// We've passed this year's reset date, so we're in the current tracking year
			trackingYear = currentYear
		}
	}

	// Calculate the tracking period: from reset date of trackingYear to day before reset date of next year
	yearStart := time.Date(trackingYear, time.Month(t.resetMonth), t.resetDay, 0, 0, 0, 0, now.Location())
	nextYearReset := time.Date(trackingYear+1, time.Month(t.resetMonth), t.resetDay, 0, 0, 0, 0, now.Location())
	yearEnd := nextYearReset.AddDate(0, 0, -1)

	startDate = yearStart.Format(time.DateOnly)
	endDate = yearEnd.Format(time.DateOnly)

	return startDate, endDate
}

// getSeasonDateRange calculates the start and end dates for a specific season
func (t *SpeciesTracker) getSeasonDateRange(seasonName string, now time.Time) (startDate, endDate string) {
	season, exists := t.seasons[seasonName]
	if !exists || season.month <= 0 || season.day <= 0 {
		// Return empty strings for unknown or invalid season
		return "", ""
	}

	// Use test year override if set, otherwise use now's year
	currentYear := now.Year()
	if t.currentYear != 0 && t.currentYear != time.Now().Year() {
		currentYear = t.currentYear
	}

	referenceTime := time.Date(
		currentYear,
		now.Month(),
		now.Day(),
		now.Hour(),
		now.Minute(),
		now.Second(),
		now.Nanosecond(),
		now.Location(),
	)
	seasonStart := calculateSeasonStartDateFor(t.seasons, season, referenceTime, true)

	// Calculate season end date - seasons last monthsPerSeason months
	// Add monthsPerSeason months, then subtract 1 day to get the last day of the final month
	seasonEnd := seasonStart.AddDate(0, monthsPerSeason, 0).AddDate(0, 0, -1)

	startDate = seasonStart.Format(time.DateOnly)
	endDate = seasonEnd.Format(time.DateOnly)

	return startDate, endDate
}

// isWithinCurrentYear checks if a detection time falls within the current tracking year
func (t *SpeciesTracker) isWithinCurrentYear(detectionTime time.Time) bool {
	// Handle uninitialized currentYear (0) - use detection time's year
	if t.currentYear == 0 {
		// When currentYear is not set, any detection is considered within the current year
		return true
	}

	// Standard calendar year case (reset on Jan 1)
	if t.resetMonth == 1 && t.resetDay == 1 {
		return detectionTime.Year() == t.currentYear
	}

	// Custom tracking year case - use getTrackingYear for consistent logic
	// For example, with July 1 reset and currentYear=2024:
	// - June 30, 2024 → getTrackingYear returns 2023 → FALSE (previous tracking year)
	// - July 1, 2024 → getTrackingYear returns 2024 → TRUE (current tracking year)
	return t.getTrackingYear(detectionTime) == t.currentYear
}
