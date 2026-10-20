package routers

import (
	"receipt-wrangler/api/internal/handlers"
	"receipt-wrangler/api/internal/middleware"

	"github.com/go-chi/chi/v5"
)

func BuildShoppingListRouter() *chi.Mux {
	shoppingListRouter := chi.NewRouter()

	shoppingListRouter.Use(middleware.UnifiedAuthMiddleware)

	shoppingListRouter.Get("/group/{groupId}", handlers.GetShoppingListsForGroup)
	shoppingListRouter.Get("/group/{groupId}/stream", handlers.StreamShoppingListEvents)
	shoppingListRouter.Post("/group/{groupId}", handlers.CreateShoppingList)

	shoppingListRouter.Put("/item/{itemId}", handlers.UpdateShoppingListItem)
	shoppingListRouter.Put("/item/{itemId}/checked", handlers.SetShoppingListItemChecked)
	shoppingListRouter.Put("/item/{itemId}/classification", handlers.SetShoppingListItemClassification)
	shoppingListRouter.Delete("/item/{itemId}", handlers.DeleteShoppingListItem)

	shoppingListRouter.Delete("/trip/{tripId}", handlers.DetachShoppingTrip)
	shoppingListRouter.Post("/trip/{tripId}/retry", handlers.RetryShoppingTrip)

	shoppingListRouter.Put("/{listId}", handlers.UpdateShoppingList)
	shoppingListRouter.Delete("/{listId}", handlers.DeleteShoppingList)
	shoppingListRouter.Post("/{listId}/item", handlers.AddShoppingListItem)
	shoppingListRouter.Post("/{listId}/clearChecked", handlers.ClearCheckedShoppingListItems)
	shoppingListRouter.Get("/{listId}/trip", handlers.GetShoppingTrips)
	shoppingListRouter.Post("/{listId}/trip", handlers.AttachShoppingTripReceipt)
	shoppingListRouter.Post("/{listId}/trip/upload", handlers.UploadShoppingTripPhoto)

	return shoppingListRouter
}
