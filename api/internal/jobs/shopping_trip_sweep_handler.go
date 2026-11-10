package jobs

import (
	"context"
	"fmt"

	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/services"
)

// HandleShoppingTripSweepTask moves the shopping trips that are due one step on: scanning an uploaded
// photo, or comparing a receipt with its list. Outcomes, including an unreachable AI, are recorded per
// trip by the service; only a database error fails the run. A run already cancelled (the server is
// stopping) does not start.
func HandleShoppingTripSweepTask(ctx context.Context) error {
	if ctx.Err() != nil {
		return nil
	}
	processed, err := services.NewShoppingTripService(nil).ProcessDueTrips()
	if processed > 0 {
		logging.LogStd(logging.LOG_LEVEL_INFO, fmt.Sprintf("shopping trips: worked on %d trip(s)", processed))
	}

	return err
}
