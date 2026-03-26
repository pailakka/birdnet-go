package api

import (
	"context"
	"net/http"
	"sort"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/tphakala/birdnet-go/internal/datastore"
)

type BirdMigrationSummary struct {
	SpeciesCount        int `json:"species_count"`
	DetectionCount      int `json:"detection_count"`
	RecentArrivalsCount int `json:"recent_arrivals_count"`
	QuietSpeciesCount   int `json:"quiet_species_count"`
}

type BirdMigrationSpeciesRecord struct {
	CommonName         string  `json:"common_name"`
	ScientificName     string  `json:"scientific_name"`
	SpeciesCode        string  `json:"species_code,omitempty"`
	Count              int     `json:"count"`
	ActiveDays         int     `json:"active_days"`
	FirstHeard         string  `json:"first_heard,omitempty"`
	LastHeard          string  `json:"last_heard,omitempty"`
	AvgConfidence      float64 `json:"avg_confidence,omitempty"`
	MaxConfidence      float64 `json:"max_confidence,omitempty"`
	ThumbnailURL       string  `json:"thumbnail_url,omitempty"`
	FirstHeardDate     string  `json:"first_heard_date"`
	LastHeardDate      string  `json:"last_heard_date"`
	DaysSinceFirstSeen int     `json:"days_since_first_seen"`
	DaysSinceLastSeen  int     `json:"days_since_last_seen"`
}

type BirdMigrationDisappearanceRecord struct {
	CommonName         string `json:"common_name"`
	ScientificName     string `json:"scientific_name"`
	SpeciesCode        string `json:"species_code,omitempty"`
	LastHeardBeforeGap string `json:"last_heard_before_gap"`
	ReturnedOn         string `json:"returned_on"`
	GapDays            int    `json:"gap_days"`
	ThumbnailURL       string `json:"thumbnail_url,omitempty"`
}

type BirdMigrationArrivalDatum struct {
	Date                   string `json:"date"`
	NewSpeciesCount        int    `json:"new_species_count"`
	CumulativeSpeciesCount int    `json:"cumulative_species_count"`
}

type BirdMigrationActivityDatum struct {
	Date               string `json:"date"`
	DetectionCount     int    `json:"detection_count"`
	ActiveSpeciesCount int    `json:"active_species_count"`
}

type BirdMigrationPageResponse struct {
	Enabled             bool                               `json:"enabled"`
	WindowDays          int                                `json:"window_days"`
	Seasons             []BirdMigrationSeason              `json:"seasons"`
	SelectedSeasonStart string                             `json:"selected_season_start,omitempty"`
	SelectedSeason      *BirdMigrationSeason               `json:"selected_season,omitempty"`
	ObservedEndDate     string                             `json:"observed_end_date,omitempty"`
	Summary             BirdMigrationSummary               `json:"summary"`
	Roster              []BirdMigrationSpeciesRecord       `json:"roster"`
	RecentArrivals      []BirdMigrationSpeciesRecord       `json:"recent_arrivals"`
	QuietSpecies        []BirdMigrationSpeciesRecord       `json:"quiet_species"`
	Disappearances      []BirdMigrationDisappearanceRecord `json:"disappearances"`
	ArrivalTimeline     []BirdMigrationArrivalDatum        `json:"arrival_timeline"`
	ActivityTimeline    []BirdMigrationActivityDatum       `json:"activity_timeline"`
}

func (c *Controller) GetBirdMigrationPage(ctx echo.Context) error {
	response, err := c.buildBirdMigrationPageResponse(
		ctx.Request().Context(),
		ctx.QueryParam("season_start"),
	)
	if err != nil {
		return c.HandleError(
			ctx,
			err,
			"Failed to get bird migration page data",
			http.StatusInternalServerError,
		)
	}

	return ctx.JSON(http.StatusOK, response)
}

func (c *Controller) buildBirdMigrationPageResponse(
	ctx context.Context,
	requestedSeasonStart string,
) (BirdMigrationPageResponse, error) {
	seasonsResponse, err := c.buildBirdMigrationSeasonsResponse(ctx)
	response := BirdMigrationPageResponse{
		Enabled:          seasonsResponse.Enabled,
		WindowDays:       seasonsResponse.WindowDays,
		Seasons:          seasonsResponse.Seasons,
		Summary:          BirdMigrationSummary{},
		Roster:           []BirdMigrationSpeciesRecord{},
		RecentArrivals:   []BirdMigrationSpeciesRecord{},
		QuietSpecies:     []BirdMigrationSpeciesRecord{},
		Disappearances:   []BirdMigrationDisappearanceRecord{},
		ArrivalTimeline:  []BirdMigrationArrivalDatum{},
		ActivityTimeline: []BirdMigrationActivityDatum{},
	}
	if err != nil {
		return response, err
	}

	if !response.Enabled || len(response.Seasons) == 0 {
		return response, nil
	}

	selectedSeason, ok := resolveBirdMigrationSelectedSeason(
		response.Seasons,
		seasonsResponse.CurrentSeasonStart,
		requestedSeasonStart,
	)
	if !ok {
		return response, nil
	}

	response.SelectedSeasonStart = selectedSeason.StartDate
	response.SelectedSeason = &BirdMigrationSeason{
		Name:      selectedSeason.Name,
		StartDate: selectedSeason.StartDate,
		EndDate:   selectedSeason.EndDate,
		IsCurrent: selectedSeason.IsCurrent,
	}
	response.ObservedEndDate = getBirdMigrationObservedEndDateForPage(
		selectedSeason,
		birdMigrationNow().Format(time.DateOnly),
	)

	ctxWithTimeout, cancel := context.WithTimeout(ctx, analyticsQueryTimeout)
	defer cancel()

	summaryData, err := c.DS.GetSpeciesSummaryData(
		ctxWithTimeout,
		selectedSeason.StartDate,
		response.ObservedEndDate,
	)
	if err != nil {
		return response, err
	}

	dailyDetections, err := c.DS.GetDailyAnalyticsData(
		ctxWithTimeout,
		selectedSeason.StartDate,
		response.ObservedEndDate,
		"",
	)
	if err != nil {
		return response, err
	}

	dailyDiversity, err := c.DS.GetSpeciesDiversityData(
		ctxWithTimeout,
		selectedSeason.StartDate,
		response.ObservedEndDate,
	)
	if err != nil {
		return response, err
	}

	disappearances, err := c.DS.GetBirdMigrationDisappearances(
		ctxWithTimeout,
		selectedSeason.StartDate,
		response.ObservedEndDate,
		response.WindowDays,
	)
	if err != nil {
		return response, err
	}

	thumbnailURLs := c.buildBirdMigrationPageThumbnailMap(summaryData, disappearances)
	response.Roster = buildBirdMigrationRoster(summaryData, response.ObservedEndDate, thumbnailURLs)
	response.RecentArrivals = buildBirdMigrationRecentArrivals(response.Roster, response.WindowDays)
	response.QuietSpecies = buildBirdMigrationQuietSpecies(response.Roster, response.WindowDays)
	response.Disappearances = buildBirdMigrationDisappearances(disappearances, thumbnailURLs)
	response.ArrivalTimeline = buildBirdMigrationArrivalTimeline(
		response.Roster,
		selectedSeason.StartDate,
		response.ObservedEndDate,
	)
	response.ActivityTimeline = buildBirdMigrationActivityTimeline(
		dailyDetections,
		dailyDiversity,
		selectedSeason.StartDate,
		response.ObservedEndDate,
	)
	response.Summary = BirdMigrationSummary{
		SpeciesCount:        len(response.Roster),
		DetectionCount:      sumBirdMigrationDetections(response.Roster),
		RecentArrivalsCount: len(response.RecentArrivals),
		QuietSpeciesCount:   len(response.QuietSpecies),
	}

	return response, nil
}

func resolveBirdMigrationSelectedSeason(
	seasons []BirdMigrationSeason,
	currentSeasonStart string,
	requestedSeasonStart string,
) (BirdMigrationSeason, bool) {
	for i := range seasons {
		if requestedSeasonStart != "" && seasons[i].StartDate == requestedSeasonStart {
			return seasons[i], true
		}
	}

	for i := range seasons {
		if seasons[i].StartDate == currentSeasonStart {
			return seasons[i], true
		}
	}

	if len(seasons) == 0 {
		return BirdMigrationSeason{}, false
	}

	return seasons[0], true
}

func getBirdMigrationObservedEndDateForPage(season BirdMigrationSeason, today string) string {
	if season.IsCurrent && today < season.EndDate {
		return today
	}

	return season.EndDate
}

func (c *Controller) buildBirdMigrationPageThumbnailMap(
	summaryData []datastore.SpeciesSummaryData,
	disappearances []datastore.BirdMigrationDisappearanceData,
) map[string]string {
	scientificNames := make([]string, 0, len(summaryData)+len(disappearances))
	seen := make(map[string]struct{}, len(summaryData)+len(disappearances))

	for i := range summaryData {
		scientificName := summaryData[i].ScientificName
		if scientificName == "" {
			continue
		}
		if _, exists := seen[scientificName]; exists {
			continue
		}
		seen[scientificName] = struct{}{}
		scientificNames = append(scientificNames, scientificName)
	}

	for i := range disappearances {
		scientificName := disappearances[i].ScientificName
		if scientificName == "" {
			continue
		}
		if _, exists := seen[scientificName]; exists {
			continue
		}
		seen[scientificName] = struct{}{}
		scientificNames = append(scientificNames, scientificName)
	}

	sort.Strings(scientificNames)
	return c.buildThumbnailMap(scientificNames)
}

func buildBirdMigrationRoster(
	summaryData []datastore.SpeciesSummaryData,
	observedEndDate string,
	thumbnailURLs map[string]string,
) []BirdMigrationSpeciesRecord {
	roster := make([]BirdMigrationSpeciesRecord, 0, len(summaryData))
	for i := range summaryData {
		item := summaryData[i]
		firstHeardDate := formatTimeIfNotZero(item.FirstSeen)
		lastHeardDate := formatTimeIfNotZero(item.LastSeen)

		firstHeardDateOnly := ""
		if !item.FirstSeen.IsZero() {
			firstHeardDateOnly = item.FirstSeen.Format(time.DateOnly)
		}

		lastHeardDateOnly := ""
		if !item.LastSeen.IsZero() {
			lastHeardDateOnly = item.LastSeen.Format(time.DateOnly)
		}

		roster = append(roster, BirdMigrationSpeciesRecord{
			CommonName:         item.CommonName,
			ScientificName:     item.ScientificName,
			SpeciesCode:        item.SpeciesCode,
			Count:              item.Count,
			ActiveDays:         item.ActiveDays,
			FirstHeard:         firstHeardDate,
			LastHeard:          lastHeardDate,
			AvgConfidence:      item.AvgConfidence,
			MaxConfidence:      item.MaxConfidence,
			ThumbnailURL:       thumbnailURLs[item.ScientificName],
			FirstHeardDate:     firstHeardDateOnly,
			LastHeardDate:      lastHeardDateOnly,
			DaysSinceFirstSeen: birdMigrationDayDifference(firstHeardDateOnly, observedEndDate),
			DaysSinceLastSeen:  birdMigrationDayDifference(lastHeardDateOnly, observedEndDate),
		})
	}

	sort.Slice(roster, func(i, j int) bool {
		if roster[i].ActiveDays != roster[j].ActiveDays {
			return roster[i].ActiveDays > roster[j].ActiveDays
		}
		if roster[i].Count != roster[j].Count {
			return roster[i].Count > roster[j].Count
		}
		return roster[i].CommonName < roster[j].CommonName
	})

	return roster
}

func buildBirdMigrationRecentArrivals(
	roster []BirdMigrationSpeciesRecord,
	windowDays int,
) []BirdMigrationSpeciesRecord {
	recentArrivals := make([]BirdMigrationSpeciesRecord, 0, len(roster))
	for i := range roster {
		if roster[i].DaysSinceFirstSeen <= windowDays {
			recentArrivals = append(recentArrivals, roster[i])
		}
	}

	sort.Slice(recentArrivals, func(i, j int) bool {
		if recentArrivals[i].FirstHeardDate != recentArrivals[j].FirstHeardDate {
			return recentArrivals[i].FirstHeardDate > recentArrivals[j].FirstHeardDate
		}
		if recentArrivals[i].ActiveDays != recentArrivals[j].ActiveDays {
			return recentArrivals[i].ActiveDays > recentArrivals[j].ActiveDays
		}
		return recentArrivals[i].CommonName < recentArrivals[j].CommonName
	})

	return recentArrivals
}

func buildBirdMigrationQuietSpecies(
	roster []BirdMigrationSpeciesRecord,
	windowDays int,
) []BirdMigrationSpeciesRecord {
	quietSpecies := make([]BirdMigrationSpeciesRecord, 0, len(roster))
	for i := range roster {
		if roster[i].DaysSinceLastSeen > windowDays {
			quietSpecies = append(quietSpecies, roster[i])
		}
	}

	sort.Slice(quietSpecies, func(i, j int) bool {
		if quietSpecies[i].DaysSinceLastSeen != quietSpecies[j].DaysSinceLastSeen {
			return quietSpecies[i].DaysSinceLastSeen > quietSpecies[j].DaysSinceLastSeen
		}
		if quietSpecies[i].ActiveDays != quietSpecies[j].ActiveDays {
			return quietSpecies[i].ActiveDays > quietSpecies[j].ActiveDays
		}
		return quietSpecies[i].CommonName < quietSpecies[j].CommonName
	})

	return quietSpecies
}

func buildBirdMigrationDisappearances(
	disappearances []datastore.BirdMigrationDisappearanceData,
	thumbnailURLs map[string]string,
) []BirdMigrationDisappearanceRecord {
	rows := make([]BirdMigrationDisappearanceRecord, 0, len(disappearances))
	for i := range disappearances {
		item := disappearances[i]
		rows = append(rows, BirdMigrationDisappearanceRecord{
			CommonName:         item.CommonName,
			ScientificName:     item.ScientificName,
			SpeciesCode:        item.SpeciesCode,
			LastHeardBeforeGap: item.LastHeardBeforeGap,
			ReturnedOn:         item.ReturnedOn,
			GapDays:            item.GapDays,
			ThumbnailURL:       thumbnailURLs[item.ScientificName],
		})
	}

	sort.Slice(rows, func(i, j int) bool {
		if rows[i].GapDays != rows[j].GapDays {
			return rows[i].GapDays > rows[j].GapDays
		}
		if rows[i].ReturnedOn != rows[j].ReturnedOn {
			return rows[i].ReturnedOn > rows[j].ReturnedOn
		}
		return rows[i].CommonName < rows[j].CommonName
	})

	return rows
}

func buildBirdMigrationArrivalTimeline(
	roster []BirdMigrationSpeciesRecord,
	startDate string,
	endDate string,
) []BirdMigrationArrivalDatum {
	arrivalsByDate := make(map[string]int, len(roster))
	for i := range roster {
		arrivalsByDate[roster[i].FirstHeardDate]++
	}

	cumulativeSpeciesCount := 0
	dateRange := birdMigrationDateRange(startDate, endDate)
	timeline := make([]BirdMigrationArrivalDatum, 0, len(dateRange))
	for _, date := range dateRange {
		newSpeciesCount := arrivalsByDate[date]
		cumulativeSpeciesCount += newSpeciesCount

		timeline = append(timeline, BirdMigrationArrivalDatum{
			Date:                   date,
			NewSpeciesCount:        newSpeciesCount,
			CumulativeSpeciesCount: cumulativeSpeciesCount,
		})
	}

	return timeline
}

func buildBirdMigrationActivityTimeline(
	dailyDetections []datastore.DailyAnalyticsData,
	dailyDiversity []datastore.DailyAnalyticsData,
	startDate string,
	endDate string,
) []BirdMigrationActivityDatum {
	detectionMap := make(map[string]int, len(dailyDetections))
	for i := range dailyDetections {
		detectionMap[dailyDetections[i].Date] = dailyDetections[i].Count
	}

	diversityMap := make(map[string]int, len(dailyDiversity))
	for i := range dailyDiversity {
		diversityMap[dailyDiversity[i].Date] = dailyDiversity[i].Count
	}

	dateRange := birdMigrationDateRange(startDate, endDate)
	timeline := make([]BirdMigrationActivityDatum, 0, len(dateRange))
	for _, date := range dateRange {
		timeline = append(timeline, BirdMigrationActivityDatum{
			Date:               date,
			DetectionCount:     detectionMap[date],
			ActiveSpeciesCount: diversityMap[date],
		})
	}

	return timeline
}

func birdMigrationDateRange(startDate, endDate string) []string {
	start, err := time.ParseInLocation(time.DateOnly, startDate, time.Local)
	if err != nil {
		return []string{}
	}

	end, err := time.ParseInLocation(time.DateOnly, endDate, time.Local)
	if err != nil || end.Before(start) {
		return []string{}
	}

	dateRange := make([]string, 0, int(end.Sub(start).Hours()/24)+1)
	for cursor := start; !cursor.After(end); cursor = cursor.AddDate(0, 0, 1) {
		dateRange = append(dateRange, cursor.Format(time.DateOnly))
	}

	return dateRange
}

func birdMigrationDayDifference(fromDate, toDate string) int {
	if fromDate == "" || toDate == "" {
		return 0
	}

	from, err := time.ParseInLocation(time.DateOnly, fromDate, time.Local)
	if err != nil {
		return 0
	}

	to, err := time.ParseInLocation(time.DateOnly, toDate, time.Local)
	if err != nil {
		return 0
	}

	return int(to.Sub(from).Hours() / 24)
}

func sumBirdMigrationDetections(roster []BirdMigrationSpeciesRecord) int {
	total := 0
	for i := range roster {
		total += roster[i].Count
	}
	return total
}
