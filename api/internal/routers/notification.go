package routers

import (
	"cartvibe/api/internal/handlers"
	"cartvibe/api/internal/middleware"

	"github.com/go-chi/chi/v5"
)

func BuildNotificationRouter() *chi.Mux {
	notificationRouter := chi.NewRouter()

	notificationRouter.Use(middleware.UnifiedAuthMiddleware)

	// swagger:route GET /notifications/ Notifications listNotifications
	//
	// Get all user notifications
	//
	// This will get all the notifications for the currently logged in user
	//
	//     Consumes:
	//     - application/json
	//
	//     Produces:
	//     - application/json
	//
	//     Schemes: https
	//
	//     Deprecated: false
	//
	//
	//
	//     Responses:
	//       200: Ok
	//       500: Internal Server Error
	notificationRouter.Get("/", handlers.GetNotificationsForUser)

	// swagger:route GET /notifications/notificationCount Notifications notificationCount
	//
	// Notification count
	//
	// This will get the notification count for the currently logged in user
	//
	//
	//     Produces:
	//     - text/plain
	//
	//     Schemes: https
	//
	//     Deprecated: false
	//
	//     Responses:
	//       200: Ok
	//       500: Internal Server Error
	notificationRouter.Get("/notificationCount", handlers.GetNotificationCountForUser)

	// swagger:route DELETE /notifications/ Notifications notificationCount
	//
	// Delete all notifications for user
	//
	// This deletes all notifications for a user
	//
	//
	//     Schemes: https
	//
	//     Deprecated: false
	//
	//     Responses:
	//       200: Ok
	//       500: Internal Server Error
	notificationRouter.Delete("/", handlers.DeleteAllNotificationsForUser)

	// swagger:route DELETE /notifications/{id} Notifications notificationCount
	//
	// Delete notification by id
	//
	// This deletes a notification by id
	//
	//
	//     Schemes: https
	//
	//     Deprecated: false
	//
	//     Responses:
	//       200: Ok
	//       500: Internal Server Error
	notificationRouter.Delete("/{id}", handlers.DeleteNotification)

	// This browser's Web Push subscription (warranty reminders on the device), saved or removed.
	notificationRouter.Post("/pushSubscription", handlers.SavePushSubscription)
	notificationRouter.Post("/pushSubscription/remove", handlers.RemovePushSubscription)

	return notificationRouter
}
