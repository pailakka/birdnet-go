package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"github.com/tphakala/birdnet-go/internal/conf"
	"github.com/tphakala/birdnet-go/internal/datastore"
)

func TestGetBirdMigrationPageDisabled(t *testing.T) {
	originalNow := birdMigrationNow
	birdMigrationNow = func() time.Time {
		return time.Date(2026, 3, 21, 12, 0, 0, 0, time.Local)
	}
	t.Cleanup(func() {
		birdMigrationNow = originalNow
	})

	e, mockDS, controller := setupTestEnvironment(t)
	controller.Settings.Realtime.SpeciesTracking.SeasonalTracking = conf.SeasonalTrackingSettings{
		Enabled:    false,
		WindowDays: 14,
		Seasons: map[string]conf.Season{
			"spring": {StartMonth: 3, StartDay: 20},
		},
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v2/analytics/bird-migration/page", http.NoBody)
	rec := httptest.NewRecorder()
	ctx := e.NewContext(req, rec)
	ctx.SetPath("/api/v2/analytics/bird-migration/page")

	err := controller.GetBirdMigrationPage(ctx)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, rec.Code)

	var response BirdMigrationPageResponse
	err = json.Unmarshal(rec.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.False(t, response.Enabled)
	assert.Equal(t, 14, response.WindowDays)
	assert.Empty(t, response.Seasons)
	assert.Empty(t, response.SelectedSeasonStart)
	assert.Nil(t, response.SelectedSeason)
	assert.Empty(t, response.ObservedEndDate)
	assert.Equal(t, BirdMigrationSummary{}, response.Summary)
	assert.Empty(t, response.Roster)
	assert.Empty(t, response.RecentArrivals)
	assert.Empty(t, response.QuietSpecies)
	assert.Empty(t, response.Disappearances)
	assert.Empty(t, response.ArrivalTimeline)
	assert.Empty(t, response.ActivityTimeline)

	mockDS.AssertNotCalled(t, "GetEarliestDetectionDate", mock.Anything)
	mockDS.AssertNotCalled(t, "GetSpeciesSummaryData", mock.Anything, mock.Anything, mock.Anything)
	mockDS.AssertNotCalled(t, "GetDailyAnalyticsData", mock.Anything, mock.Anything, mock.Anything, mock.Anything)
	mockDS.AssertNotCalled(t, "GetSpeciesDiversityData", mock.Anything, mock.Anything, mock.Anything)
	mockDS.AssertNotCalled(t, "GetBirdMigrationDisappearances", mock.Anything, mock.Anything, mock.Anything, mock.Anything)
}

func TestGetBirdMigrationPageResolvesRequestedSeasonAndObservedEndDate(t *testing.T) {
	originalNow := birdMigrationNow
	birdMigrationNow = func() time.Time {
		return time.Date(2026, 3, 21, 12, 0, 0, 0, time.Local)
	}
	t.Cleanup(func() {
		birdMigrationNow = originalNow
	})

	testCases := []struct {
		name string
		path string
	}{
		{
			name: "missing season uses current season",
			path: "/api/v2/analytics/bird-migration/page",
		},
		{
			name: "invalid season uses current season",
			path: "/api/v2/analytics/bird-migration/page?season_start=2024-03-20",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			e, mockDS, controller := setupTestEnvironment(t)
			controller.BirdImageCache = nil
			controller.Settings.BirdNET.Latitude = 60.0
			controller.Settings.Realtime.SpeciesTracking.SeasonalTracking = conf.SeasonalTrackingSettings{
				Enabled:    true,
				WindowDays: 7,
				Seasons: map[string]conf.Season{
					"spring": {StartMonth: 3, StartDay: 20},
					"summer": {StartMonth: 6, StartDay: 21},
					"fall":   {StartMonth: 9, StartDay: 22},
					"winter": {StartMonth: 12, StartDay: 21},
				},
			}

			mockDS.On("GetEarliestDetectionDate", mock.Anything).
				Return(time.Date(2025, 6, 25, 0, 0, 0, 0, time.Local), nil).
				Once()
			mockDS.On("GetSpeciesSummaryData", mock.Anything, "2026-03-20", "2026-03-21").
				Return([]datastore.SpeciesSummaryData{}, nil).
				Once()
			mockDS.On("GetDailyAnalyticsData", mock.Anything, "2026-03-20", "2026-03-21", "").
				Return([]datastore.DailyAnalyticsData{}, nil).
				Once()
			mockDS.On("GetSpeciesDiversityData", mock.Anything, "2026-03-20", "2026-03-21").
				Return([]datastore.DailyAnalyticsData{}, nil).
				Once()
			mockDS.On("GetBirdMigrationDisappearances", mock.Anything, "2026-03-20", "2026-03-21", 7).
				Return([]datastore.BirdMigrationDisappearanceData{}, nil).
				Once()

			req := httptest.NewRequest(http.MethodGet, tc.path, http.NoBody)
			rec := httptest.NewRecorder()
			ctx := e.NewContext(req, rec)
			ctx.SetPath("/api/v2/analytics/bird-migration/page")

			err := controller.GetBirdMigrationPage(ctx)
			require.NoError(t, err)
			require.Equal(t, http.StatusOK, rec.Code)

			var response BirdMigrationPageResponse
			err = json.Unmarshal(rec.Body.Bytes(), &response)
			require.NoError(t, err)

			require.NotNil(t, response.SelectedSeason)
			assert.True(t, response.Enabled)
			assert.Equal(t, "2026-03-20", response.SelectedSeasonStart)
			assert.Equal(t, "2026-03-21", response.ObservedEndDate)
			assert.Equal(t, "spring", response.SelectedSeason.Name)
			assert.Equal(t, "2026-03-20", response.SelectedSeason.StartDate)
			assert.Equal(t, "2026-06-20", response.SelectedSeason.EndDate)
			assert.True(t, response.SelectedSeason.IsCurrent)
			assert.Len(t, response.Seasons, 4)
			assert.Len(t, response.ArrivalTimeline, 2)
			assert.Len(t, response.ActivityTimeline, 2)

			mockDS.AssertExpectations(t)
		})
	}
}

func TestGetBirdMigrationPageBuildsPagePayload(t *testing.T) {
	originalNow := birdMigrationNow
	birdMigrationNow = func() time.Time {
		return time.Date(2026, 4, 21, 12, 0, 0, 0, time.Local)
	}
	t.Cleanup(func() {
		birdMigrationNow = originalNow
	})

	e, mockDS, controller := setupTestEnvironment(t)
	controller.BirdImageCache = nil
	controller.Settings.BirdNET.Latitude = 60.0
	controller.Settings.Realtime.SpeciesTracking.SeasonalTracking = conf.SeasonalTrackingSettings{
		Enabled:    true,
		WindowDays: 7,
		Seasons: map[string]conf.Season{
			"spring": {StartMonth: 3, StartDay: 20},
			"summer": {StartMonth: 6, StartDay: 21},
			"fall":   {StartMonth: 9, StartDay: 22},
			"winter": {StartMonth: 12, StartDay: 21},
		},
	}

	mockDS.On("GetEarliestDetectionDate", mock.Anything).
		Return(time.Date(2025, 12, 15, 0, 0, 0, 0, time.Local), nil).
		Once()
	mockDS.On("GetSpeciesSummaryData", mock.Anything, "2026-03-20", "2026-04-21").
		Return([]datastore.SpeciesSummaryData{
			{
				ScientificName: "Cygnus cygnus",
				CommonName:     "Whooper Swan",
				SpeciesCode:    "whoswa",
				Count:          8,
				ActiveDays:     3,
				FirstSeen:      time.Date(2026, 4, 18, 7, 10, 0, 0, time.Local),
				LastSeen:       time.Date(2026, 4, 21, 8, 20, 0, 0, time.Local),
				AvgConfidence:  0.92,
				MaxConfidence:  0.97,
			},
			{
				ScientificName: "Grus grus",
				CommonName:     "Common Crane",
				SpeciesCode:    "comcra",
				Count:          5,
				ActiveDays:     2,
				FirstSeen:      time.Date(2026, 3, 25, 6, 15, 0, 0, time.Local),
				LastSeen:       time.Date(2026, 4, 1, 6, 40, 0, 0, time.Local),
				AvgConfidence:  0.87,
				MaxConfidence:  0.93,
			},
			{
				ScientificName: "Erithacus rubecula",
				CommonName:     "European Robin",
				SpeciesCode:    "eurrob",
				Count:          11,
				ActiveDays:     5,
				FirstSeen:      time.Date(2026, 3, 20, 5, 45, 0, 0, time.Local),
				LastSeen:       time.Date(2026, 4, 20, 6, 0, 0, 0, time.Local),
				AvgConfidence:  0.89,
				MaxConfidence:  0.95,
			},
		}, nil).
		Once()
	mockDS.On("GetDailyAnalyticsData", mock.Anything, "2026-03-20", "2026-04-21", "").
		Return([]datastore.DailyAnalyticsData{
			{Date: "2026-04-18", Count: 4},
			{Date: "2026-04-19", Count: 7},
			{Date: "2026-04-20", Count: 5},
			{Date: "2026-04-21", Count: 8},
		}, nil).
		Once()
	mockDS.On("GetSpeciesDiversityData", mock.Anything, "2026-03-20", "2026-04-21").
		Return([]datastore.DailyAnalyticsData{
			{Date: "2026-04-18", Count: 1},
			{Date: "2026-04-19", Count: 1},
			{Date: "2026-04-20", Count: 2},
			{Date: "2026-04-21", Count: 3},
		}, nil).
		Once()
	mockDS.On("GetBirdMigrationDisappearances", mock.Anything, "2026-03-20", "2026-04-21", 7).
		Return([]datastore.BirdMigrationDisappearanceData{
			{
				ScientificName:     "Turdus merula",
				CommonName:         "Common Blackbird",
				SpeciesCode:        "combla",
				LastHeardBeforeGap: "2026-03-29",
				ReturnedOn:         "2026-04-17",
				GapDays:            19,
			},
			{
				ScientificName:     "Turdus pilaris",
				CommonName:         "Fieldfare",
				SpeciesCode:        "fieldf",
				LastHeardBeforeGap: "2026-04-05",
				ReturnedOn:         "2026-04-12",
				GapDays:            11,
			},
		}, nil).
		Once()

	req := httptest.NewRequest(
		http.MethodGet,
		"/api/v2/analytics/bird-migration/page?season_start=2026-03-20",
		http.NoBody,
	)
	rec := httptest.NewRecorder()
	ctx := e.NewContext(req, rec)
	ctx.SetPath("/api/v2/analytics/bird-migration/page")

	err := controller.GetBirdMigrationPage(ctx)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, rec.Code)

	var response BirdMigrationPageResponse
	err = json.Unmarshal(rec.Body.Bytes(), &response)
	require.NoError(t, err)

	require.NotNil(t, response.SelectedSeason)
	assert.Equal(t, "2026-03-20", response.SelectedSeasonStart)
	assert.Equal(t, "2026-04-21", response.ObservedEndDate)
	assert.Equal(t, "spring", response.SelectedSeason.Name)
	assert.Equal(t, 3, response.Summary.SpeciesCount)
	assert.Equal(t, 24, response.Summary.DetectionCount)
	assert.Equal(t, 1, response.Summary.RecentArrivalsCount)
	assert.Equal(t, 1, response.Summary.QuietSpeciesCount)

	require.Len(t, response.RecentArrivals, 1)
	assert.Equal(t, "Cygnus cygnus", response.RecentArrivals[0].ScientificName)
	assert.Equal(t, placeholderImageURL, response.RecentArrivals[0].ThumbnailURL)

	require.Len(t, response.QuietSpecies, 1)
	assert.Equal(t, "Grus grus", response.QuietSpecies[0].ScientificName)
	assert.Equal(t, 20, response.QuietSpecies[0].DaysSinceLastSeen)

	require.Len(t, response.Roster, 3)
	assert.Equal(t, []string{
		"Erithacus rubecula",
		"Cygnus cygnus",
		"Grus grus",
	}, []string{
		response.Roster[0].ScientificName,
		response.Roster[1].ScientificName,
		response.Roster[2].ScientificName,
	})
	assert.Equal(t, placeholderImageURL, response.Roster[0].ThumbnailURL)

	require.Len(t, response.Disappearances, 2)
	assert.Equal(t, "Turdus merula", response.Disappearances[0].ScientificName)
	assert.Equal(t, "Turdus pilaris", response.Disappearances[1].ScientificName)
	assert.Equal(t, placeholderImageURL, response.Disappearances[0].ThumbnailURL)

	require.NotEmpty(t, response.ArrivalTimeline)
	assert.Equal(t, BirdMigrationArrivalDatum{
		Date:                   "2026-04-21",
		NewSpeciesCount:        0,
		CumulativeSpeciesCount: 3,
	}, response.ArrivalTimeline[len(response.ArrivalTimeline)-1])

	require.NotEmpty(t, response.ActivityTimeline)
	assert.Equal(t, BirdMigrationActivityDatum{
		Date:               "2026-04-21",
		DetectionCount:     8,
		ActiveSpeciesCount: 3,
	}, response.ActivityTimeline[len(response.ActivityTimeline)-1])

	mockDS.AssertExpectations(t)
}
