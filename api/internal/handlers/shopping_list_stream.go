package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"receipt-wrangler/api/internal/logging"
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/permissions"
	"receipt-wrangler/api/internal/services"
	"receipt-wrangler/api/internal/structs"
	"receipt-wrangler/api/internal/utils"
	"time"

	"github.com/go-chi/chi/v5"
)

// Variables rather than constants so tests can shorten them.
var (
	// shoppingListStreamHeartbeat must stay under nginx's default 60s proxy_read_timeout. Each beat
	// also re-checks the caller's permission, so a member removed from the group stops receiving
	// within one interval.
	shoppingListStreamHeartbeat = 25 * time.Second

	// shoppingListStreamMaxLifetime bounds how long one connection can outlive the credential that
	// opened it — an expiring access token, a revoked API key, a role change. The server ends the
	// response cleanly and EventSource reconnects on its own, re-authenticating from scratch.
	shoppingListStreamMaxLifetime = 15 * time.Minute
)

// shoppingListStreamRetryMs tells EventSource how long to wait before reconnecting.
const shoppingListStreamRetryMs = 3000

func StreamShoppingListEvents(w http.ResponseWriter, r *http.Request) {
	groupId := chi.URLParam(r, "groupId")

	handler := structs.Handler{
		ErrorMessage:     "Error streaming shopping list events",
		Writer:           w,
		Request:          r,
		GroupId:          groupId,
		GroupPermissions: []string{permissions.GroupShoppingListsRead},
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			uintGroupId, err := utils.StringToUint(groupId)
			if err != nil {
				return http.StatusBadRequest, err
			}

			ok, err := rejectAllGroupShoppingList(w, uintGroupId)
			if err != nil {
				return http.StatusInternalServerError, err
			}
			if !ok {
				return 0, nil
			}

			streamShoppingListEvents(w, r, uintGroupId, structs.GetClaims(r).UserId)

			// The response is already streaming, so HandleRequest must not write an error body after
			// it; streamShoppingListEvents logs its own failures.
			return 0, nil
		},
	}

	HandleRequest(handler)
}

func streamShoppingListEvents(w http.ResponseWriter, r *http.Request, groupId uint, userId uint) {
	controller := http.NewResponseController(w)

	// The server's WriteTimeout (main.go) would otherwise cut every stream off at five minutes.
	err := controller.SetWriteDeadline(time.Time{})
	if err != nil && !errors.Is(err, http.ErrNotSupported) {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "shopping list stream: clearing write deadline: "+err.Error())
		return
	}

	header := w.Header()
	header.Set("Content-Type", "text/event-stream")
	header.Set("Cache-Control", "no-cache")
	// Tells nginx — ours, and a Synology DSM reverse proxy in front of it — not to buffer the stream.
	header.Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	hub := services.GetShoppingListHub()
	subscriber := hub.Subscribe(groupId)
	defer hub.Unsubscribe(subscriber)

	_, err = fmt.Fprintf(w, "retry: %d\n: connected\n\n", shoppingListStreamRetryMs)
	if err == nil {
		err = controller.Flush()
	}
	if err != nil {
		return
	}

	heartbeat := time.NewTicker(shoppingListStreamHeartbeat)
	defer heartbeat.Stop()

	lifetime := time.NewTimer(shoppingListStreamMaxLifetime)
	defer lifetime.Stop()

	permissionService := services.NewPermissionService(nil)

	for {
		select {
		case <-r.Context().Done():
			return

		case <-lifetime.C:
			return

		case <-subscriber.Dropped:
			// The client fell too far behind; it reconnects and refetches.
			return

		case event := <-subscriber.Events:
			if writeShoppingListEvent(w, controller, event) != nil {
				return
			}

		case <-heartbeat.C:
			allowed, err := permissionService.HasGroupPermissions(userId, groupId, permissions.GroupShoppingListsRead)
			if err != nil {
				logging.LogStd(logging.LOG_LEVEL_ERROR, "shopping list stream: permission re-check: "+err.Error())
				return
			}
			if !allowed {
				return
			}

			_, err = fmt.Fprint(w, ": ping\n\n")
			if err == nil {
				err = controller.Flush()
			}
			if err != nil {
				return
			}
		}
	}
}

func writeShoppingListEvent(w http.ResponseWriter, controller *http.ResponseController, event models.ShoppingListEvent) error {
	data, err := json.Marshal(event)
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "shopping list stream: marshalling event: "+err.Error())
		return err
	}

	_, err = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event.Type, data)
	if err != nil {
		return err
	}

	return controller.Flush()
}
