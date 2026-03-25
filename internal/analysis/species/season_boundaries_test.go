package species

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/tphakala/birdnet-go/internal/conf"
)

func TestResolveSeasonBoundary(t *testing.T) {
	seasons := map[string]conf.Season{
		"spring": {StartMonth: 3, StartDay: 20},
		"summer": {StartMonth: 6, StartDay: 21},
		"fall":   {StartMonth: 9, StartDay: 22},
		"winter": {StartMonth: 12, StartDay: 21},
	}

	boundary, err := ResolveSeasonBoundary(
		time.Date(2026, 1, 15, 12, 0, 0, 0, time.Local),
		seasons,
	)
	require.NoError(t, err)

	assert.Equal(t, "winter", boundary.Name)
	assert.Equal(t, "2025-12-21", boundary.Start.Format(time.DateOnly))
}

func TestNextSeasonBoundary(t *testing.T) {
	seasons := map[string]conf.Season{
		"spring": {StartMonth: 3, StartDay: 20},
		"summer": {StartMonth: 6, StartDay: 21},
		"fall":   {StartMonth: 9, StartDay: 22},
		"winter": {StartMonth: 12, StartDay: 21},
	}

	boundary, err := NextSeasonBoundary(
		time.Date(2025, 12, 21, 0, 0, 0, 0, time.Local),
		seasons,
	)
	require.NoError(t, err)

	assert.Equal(t, "spring", boundary.Name)
	assert.Equal(t, "2026-03-20", boundary.Start.Format(time.DateOnly))
}
